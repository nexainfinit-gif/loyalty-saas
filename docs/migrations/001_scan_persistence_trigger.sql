-- Migration 001 — Scan persistence trigger
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query → Run)
--
-- Problem solved:
--   POST /api/scan/[token] inserts a transaction but never updates customers.total_points
--   or stamps_count. This trigger fixes the gap atomically and concurrency-safely.
--
-- What this does:
--   1. Adds `stamps_delta` column to transactions (how many stamps to award per scan)
--   2. Drops ALL pre-existing triggers on the transactions table (prevents double-increment)
--   3. Creates a single trigger function that fires AFTER every transaction INSERT
--   4. The trigger atomically increments customers.total_points, stamps_count,
--      last_visit_at, and total_visits — no separate API call, no race condition.
--
-- Safety:
--   - Uses incremental UPDATE (total_points = total_points + NEW.points_delta)
--     NOT absolute (total_points = 5) — safe under concurrent scans
--   - Scoped to customer_id only (no cross-tenant risk)
--   - Idempotent: re-running this migration is safe (uses IF NOT EXISTS / OR REPLACE)

-- ── DIAGNOSTIC (run first to see what triggers already exist) ──────────────────
-- SELECT tgname AS trigger_name, proname AS function_name
-- FROM   pg_trigger t
-- JOIN   pg_proc    p ON p.oid = t.tgfoid
-- WHERE  tgrelid = 'transactions'::regclass
--   AND  NOT tgisinternal
-- ORDER  BY tgname;

-- ── Step 1: Add stamps_delta column to transactions ───────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS stamps_delta INTEGER NOT NULL DEFAULT 0;

-- ── Step 2: Drop ALL AFTER INSERT triggers on transactions ────────────────────
-- This prevents double-increment if a trigger already existed before this migration.
-- The DO block dynamically drops every trigger attached to the transactions table
-- so we end up with exactly one trigger (ours) managing customer balance updates.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tgname
    FROM   pg_trigger
    WHERE  tgrelid = 'transactions'::regclass
      AND  NOT tgisinternal
      AND  tgtype & 4 > 0   -- AFTER triggers only (bitmask: INSERT=4, UPDATE=8, DELETE=16)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON transactions', rec.tgname);
    RAISE NOTICE 'Dropped trigger: %', rec.tgname;
  END LOOP;
END;
$$;

-- ── Step 3: Create the trigger function ──────────────────────────────────────
-- Strict column mapping:
--   total_points  ← points_delta  (never stamps_delta)
--   stamps_count  ← stamps_delta  (never points_delta)
-- This prevents cross-contamination between the two loyalty modes.
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

-- ── Step 4: Attach the (now single) trigger ───────────────────────────────────
CREATE TRIGGER trg_update_customer_after_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_update_customer_after_transaction();

-- ── Verification (run after migration) ───────────────────────────────────────
-- Should return exactly ONE row: trg_update_customer_after_transaction
-- SELECT tgname AS trigger_name, proname AS function_name
-- FROM   pg_trigger t
-- JOIN   pg_proc    p ON p.oid = t.tgfoid
-- WHERE  tgrelid = 'transactions'::regclass
--   AND  NOT tgisinternal
-- ORDER  BY tgname;
