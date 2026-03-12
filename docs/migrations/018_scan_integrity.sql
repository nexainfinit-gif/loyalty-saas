-- Migration 018: Scan Integrity
-- Adds scan_events audit trail and wallet_sync_queue for decoupled wallet sync.
-- Run in Supabase SQL Editor.

-- ── scan_events: structured audit trail for every scan ──────────────────
CREATE TABLE scan_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        UUID NOT NULL REFERENCES restaurants(id),
  customer_id          UUID NOT NULL REFERENCES customers(id),
  idempotency_key      UUID UNIQUE,
  resolved_by          TEXT NOT NULL CHECK (resolved_by IN ('qr_token', 'id', 'short_code')),
  points_awarded       INTEGER NOT NULL DEFAULT 0,
  stamps_delta         INTEGER NOT NULL DEFAULT 0,
  balance_before       INTEGER NOT NULL,
  balance_after        INTEGER NOT NULL,
  stamps_before        INTEGER NOT NULL DEFAULT 0,
  stamps_after         INTEGER NOT NULL DEFAULT 0,
  program_type         TEXT NOT NULL DEFAULT 'points',
  reward_triggered     BOOLEAN NOT NULL DEFAULT FALSE,
  stamp_card_completed BOOLEAN NOT NULL DEFAULT FALSE,
  scanner_user_id      UUID,
  response_cache       JSONB,
  scanned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scan_events_customer   ON scan_events(customer_id, scanned_at DESC);
CREATE INDEX idx_scan_events_restaurant ON scan_events(restaurant_id, scanned_at DESC);
CREATE INDEX idx_scan_events_idemp      ON scan_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- RLS: restaurant owner can read their own scan events
ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_events_owner ON scan_events
  FOR ALL
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

-- ── wallet_sync_queue: decoupled wallet sync after scan ─────────────────
CREATE TABLE wallet_sync_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_event_id   UUID REFERENCES scan_events(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX idx_wallet_sync_queue_pending ON wallet_sync_queue(status, created_at)
  WHERE status IN ('pending', 'failed');

-- RLS
ALTER TABLE wallet_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_sync_queue_owner ON wallet_sync_queue
  FOR ALL
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));
