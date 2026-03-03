-- Migration 008 — Growth Actions
-- Safe to re-run (IF NOT EXISTS / DO NOTHING).
--
-- Purpose:
--   Stores actionable items derived from growth triggers.
--   One row per (restaurant × trigger_key) when status is pending/in_progress.
--   Past actions (executed/dismissed) are kept for audit.
--
--   Populated by /api/cron/metrics (after KPI computation) and by
--   POST /api/admin/metrics/recompute.
--   Managed via /api/admin/growth/actions.

CREATE TABLE IF NOT EXISTS growth_actions (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- Which rule produced this action (matches RULES[].id in lib/growth-triggers.ts)
  trigger_key   text         NOT NULL,

  -- Coarser category used by the UI and future automation
  action_type   text         NOT NULL,

  -- Full trigger data: { type, severity, title, message, suggested_plan? }
  payload       jsonb        NOT NULL DEFAULT '{}',

  -- Lifecycle: pending → in_progress → executed | dismissed
  status        text         NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'executed', 'dismissed')),

  created_at    timestamptz  NOT NULL DEFAULT now(),
  executed_at   timestamptz  NULL
);

-- Primary lookup: all pending actions for a restaurant
CREATE INDEX IF NOT EXISTS idx_growth_actions_restaurant_status
  ON growth_actions (restaurant_id, status);

-- Admin list: all pending platform-wide, ordered by creation date
CREATE INDEX IF NOT EXISTS idx_growth_actions_status_created
  ON growth_actions (status, created_at DESC);

-- Dedup check: active (pending/in_progress) action per restaurant+trigger
CREATE INDEX IF NOT EXISTS idx_growth_actions_restaurant_trigger_status
  ON growth_actions (restaurant_id, trigger_key, status);

-- RLS: restaurant owners see only their own actions (admin uses service role)
ALTER TABLE growth_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'growth_actions' AND policyname = 'ga_owner_select'
  ) THEN
    CREATE POLICY ga_owner_select
      ON growth_actions FOR SELECT
      USING (
        restaurant_id IN (
          SELECT id FROM restaurants WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Verification:
--   SELECT table_name FROM information_schema.tables WHERE table_name = 'growth_actions';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'growth_actions';
