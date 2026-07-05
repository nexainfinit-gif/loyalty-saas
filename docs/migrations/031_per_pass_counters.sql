-- Migration 031 — Per-pass loyalty counters
-- Moves loyalty balances from customer-level to pass-level.
-- Customer-level columns remain as computed aggregates (dashboard display).
--
-- Constraint: max 1 active pass per kind (stamps / points / vip) per customer per restaurant.
-- Run this in the Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════
-- 1. ADD COUNTER COLUMNS TO wallet_passes
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE wallet_passes
  ADD COLUMN IF NOT EXISTS total_points    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stamps_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_pending  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_cards INTEGER NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════
-- 2. ADD pass_kind COLUMN TO wallet_passes (denormalized from template)
-- ═══════════════════════════════════════════════════════════════
-- Needed for the unique constraint and fast lookups without joining templates.

ALTER TABLE wallet_passes
  ADD COLUMN IF NOT EXISTS pass_kind TEXT NOT NULL DEFAULT 'points';

-- Backfill pass_kind from template
UPDATE wallet_passes wp
SET pass_kind = COALESCE(t.pass_kind, 'points')
FROM wallet_pass_templates t
WHERE wp.template_id = t.id
  AND wp.pass_kind = 'points';  -- only update rows that still have the default

-- ═══════════════════════════════════════════════════════════════
-- 3. UNIQUE CONSTRAINT: max 1 active pass per kind per customer per restaurant
-- ═══════════════════════════════════════════════════════════════
-- Partial unique index — only enforced for active passes.

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_passes_one_active_per_kind
  ON wallet_passes (restaurant_id, customer_id, pass_kind)
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════
-- 4. ADD wallet_pass_id TO transactions
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS wallet_pass_id UUID REFERENCES wallet_passes(id);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_pass
  ON transactions(wallet_pass_id) WHERE wallet_pass_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 5. ADD wallet_pass_id TO scan_events
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE scan_events
  ADD COLUMN IF NOT EXISTS wallet_pass_id UUID REFERENCES wallet_passes(id);

-- ═══════════════════════════════════════════════════════════════
-- 6. BACKFILL — copy customer balances to their most recent active pass
-- ═══════════════════════════════════════════════════════════════
-- For each customer, the most recently created active pass inherits the
-- current customer-level balance. Other passes stay at 0.

WITH ranked AS (
  SELECT
    wp.id AS pass_id,
    wp.customer_id,
    c.total_points,
    c.stamps_count,
    COALESCE(c.reward_pending, FALSE) AS reward_pending,
    ROW_NUMBER() OVER (
      PARTITION BY wp.customer_id
      ORDER BY wp.created_at DESC
    ) AS rn
  FROM wallet_passes wp
  JOIN customers c ON c.id = wp.customer_id
  WHERE wp.status = 'active'
)
UPDATE wallet_passes
SET
  total_points   = ranked.total_points,
  stamps_count   = ranked.stamps_count,
  reward_pending = ranked.reward_pending
FROM ranked
WHERE wallet_passes.id = ranked.pass_id
  AND ranked.rn = 1;

-- ═══════════════════════════════════════════════════════════════
-- 7. UPDATE TRIGGER — also increment pass-level counters
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_fn_update_customer_after_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Always update customer-level aggregates (backward compat + dashboard)
  UPDATE customers
  SET
    total_points  = total_points  + NEW.points_delta,
    stamps_count  = stamps_count  + NEW.stamps_delta,
    total_visits  = total_visits  + CASE WHEN NEW.type = 'visit' THEN 1 ELSE 0 END,
    last_visit_at = CASE WHEN NEW.type = 'visit' THEN NOW() ELSE last_visit_at END
  WHERE id = NEW.customer_id;

  -- 2. If transaction targets a specific pass, update pass-level counters
  IF NEW.wallet_pass_id IS NOT NULL THEN
    UPDATE wallet_passes
    SET
      total_points = total_points + NEW.points_delta,
      stamps_count = stamps_count + NEW.stamps_delta
    WHERE id = NEW.wallet_pass_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
-- After running, verify:
--   SELECT id, pass_kind, total_points, stamps_count, reward_pending
--   FROM wallet_passes WHERE status = 'active' LIMIT 20;
