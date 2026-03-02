-- Migration 003 — Per-restaurant scanner token
-- Run in Supabase SQL editor.
-- Safe to re-run (IF NOT EXISTS).
--
-- Purpose:
--   Adds a stable, rotatable UUID token to every restaurant row.
--   This token is embedded in the public cashier scanner URL:
--     https://app.example.com/scan/{scanner_token}
--
--   The scanner page sends it in the `X-Scanner-Token` request header so that
--   POST /api/scan/[qrToken] can identify the restaurant without requiring an
--   owner Supabase session. Owners can rotate the token at any time from the
--   dashboard to revoke cashier access immediately.
--
-- No breaking changes — existing rows receive a freshly generated UUID via DEFAULT.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS scanner_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Unique index ensures fast lookup and prevents collisions.
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_scanner_token_idx
  ON restaurants(scanner_token);

-- ── Verification ──────────────────────────────────────────────────────────────
-- After running, confirm all restaurants have a scanner_token:
-- SELECT id, name, scanner_token FROM restaurants;
