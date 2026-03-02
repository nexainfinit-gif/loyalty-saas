-- Hotfix 001b — Remove duplicate trigger causing +2 instead of +1
-- Run this in the Supabase SQL editor if you already ran migration 001
-- and are seeing double-increment (total_points += 2 per scan).
--
-- Root cause: a pre-existing trigger on the transactions table was already
-- incrementing customers.total_points. Migration 001 only dropped a trigger
-- named 'trg_update_customer_after_transaction', leaving the old trigger intact.
-- Result: 2 triggers × 1 INSERT = 2 increments.
--
-- This hotfix drops ALL AFTER INSERT triggers on transactions, then reinstalls
-- exactly one (ours). Net result: 1 scan = 1 INSERT = 1 increment = +1 point.

-- Step 1: Diagnose — see what's currently attached
SELECT tgname AS trigger_name, proname AS function_name
FROM   pg_trigger t
JOIN   pg_proc    p ON p.oid = t.tgfoid
WHERE  tgrelid = 'transactions'::regclass
  AND  NOT tgisinternal
ORDER  BY tgname;

-- Step 2: Drop every AFTER INSERT trigger on transactions
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tgname
    FROM   pg_trigger
    WHERE  tgrelid = 'transactions'::regclass
      AND  NOT tgisinternal
      AND  tgtype & 4 > 0
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON transactions', rec.tgname);
    RAISE NOTICE 'Dropped trigger: %', rec.tgname;
  END LOOP;
END;
$$;

-- Step 3: Reinstall the canonical trigger function (idempotent)
CREATE OR REPLACE FUNCTION trg_fn_update_customer_after_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE customers
  SET
    total_points  = total_points  + NEW.points_delta,
    stamps_count  = stamps_count  + NEW.stamps_delta,
    total_visits  = total_visits  + CASE WHEN NEW.type = 'visit' THEN 1 ELSE 0 END,
    last_visit_at = CASE WHEN NEW.type = 'visit' THEN NOW() ELSE last_visit_at END
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$;

-- Step 4: Attach exactly one trigger
CREATE TRIGGER trg_update_customer_after_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_update_customer_after_transaction();

-- Step 5: Confirm — should return exactly ONE row
SELECT tgname AS trigger_name, proname AS function_name
FROM   pg_trigger t
JOIN   pg_proc    p ON p.oid = t.tgfoid
WHERE  tgrelid = 'transactions'::regclass
  AND  NOT tgisinternal
ORDER  BY tgname;

-- ── Optional: fix already-corrupted totals ────────────────────────────────────
-- If scans during the double-increment window created bad totals, run this
-- to recompute total_points and stamps_count from the transactions table:
--
-- UPDATE customers c
-- SET
--   total_points = COALESCE(agg.total_points, 0),
--   stamps_count = COALESCE(agg.stamps_count, 0),
--   total_visits = COALESCE(agg.total_visits, 0)
-- FROM (
--   SELECT
--     customer_id,
--     SUM(points_delta)  AS total_points,
--     SUM(COALESCE(stamps_delta, 0)) AS stamps_count,
--     COUNT(*) FILTER (WHERE type = 'visit') AS total_visits
--   FROM transactions
--   GROUP BY customer_id
-- ) agg
-- WHERE c.id = agg.customer_id;
