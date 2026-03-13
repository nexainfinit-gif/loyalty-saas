-- Migration: Create scan_actions table
-- Stores configurable scan action buttons per restaurant

CREATE TABLE IF NOT EXISTS scan_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  icon            TEXT,                                       -- optional emoji
  points_value    INTEGER NOT NULL DEFAULT 1,                 -- points or stamps to add
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_actions_restaurant
  ON scan_actions(restaurant_id, sort_order);

-- RLS
ALTER TABLE scan_actions ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own scan actions
CREATE POLICY scan_actions_owner_all ON scan_actions
  FOR ALL
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

-- Service role bypass (for API routes using supabaseAdmin)
CREATE POLICY scan_actions_service_role ON scan_actions
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
