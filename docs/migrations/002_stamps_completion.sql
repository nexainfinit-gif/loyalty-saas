-- Migration 002 — Stamps card completion tracking
-- Run in Supabase SQL editor AFTER migration 001.
-- Safe to re-run (IF NOT EXISTS + CREATE OR REPLACE).
--
-- Design: completion is detected INSIDE the trigger from the sign of stamps_delta,
-- not from a separate transactions.cards_completed column. This eliminates the
-- fragile dependency that caused silent INSERT failures in the previous version.
--
-- stamps_delta encoding (set by the scan route):
--   Normal stamp scan  :  stamps_delta = +1                 → stamps_count N → N+1
--   Completing scan    :  stamps_delta = 1 - stamps_total   → stamps_count N → 0
--     e.g. stamps_total=10 → stamps_delta = -9 → 9 + (-9) = 0  ✓
--
-- The trigger detects completion when stamps_delta < 0 AND the resulting
-- stamps_count would be ≤ 0.  Any negative delta that resets the counter counts.

-- ── Step 1: Add completed_cards to customers ──────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS completed_cards INTEGER NOT NULL DEFAULT 0;

-- ── Step 2: Replace trigger function — self-contained completion detection ─────

CREATE OR REPLACE FUNCTION trg_fn_update_customer_after_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE customers
  SET
    total_points    = total_points    + NEW.points_delta,
    stamps_count    = stamps_count    + NEW.stamps_delta,
    completed_cards = completed_cards + CASE
                        WHEN NEW.stamps_delta < 0
                         AND (stamps_count + NEW.stamps_delta) <= 0
                        THEN 1
                        ELSE 0
                      END,
    total_visits    = total_visits    + CASE WHEN NEW.type = 'visit' THEN 1 ELSE 0 END,
    last_visit_at   = CASE WHEN NEW.type = 'visit' THEN NOW() ELSE last_visit_at END
  WHERE id = NEW.customer_id;

  RETURN NEW;
END;
$$;

-- No trigger DROP/CREATE needed — the existing trigger binding from migration 001
-- already points to trg_fn_update_customer_after_transaction() by name.
-- CREATE OR REPLACE updates the function body in-place.

-- ── Verification ──────────────────────────────────────────────────────────────
-- Run after migration:

-- 1. Confirm completed_cards column exists
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'customers' AND column_name = 'completed_cards';

-- 2. Confirm trigger function was updated (check definition)
-- SELECT prosrc FROM pg_proc WHERE proname = 'trg_fn_update_customer_after_transaction';

-- 3. Simulate a completion: insert a transaction with stamps_delta = -9
--    then verify stamps_count = 0 and completed_cards incremented by 1.
--    (Use a test customer_id you can rollback)
