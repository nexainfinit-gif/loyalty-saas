-- Migration 004 — Growth metrics & health scores
-- Run in Supabase SQL editor.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).
--
-- Purpose:
--   Adds two new tables for the internal operator growth dashboard:
--
--   1. restaurant_metrics_daily
--      One row per (date × restaurant). Populated nightly by the
--      /api/cron/metrics-daily job. Immutable once written for a past date;
--      today's row is upserted (idempotent ON CONFLICT DO UPDATE).
--
--   2. restaurant_health_snapshot
--      One row per restaurant. Replaced on every cron run.
--      Stores computed scores (0-100) and a reasons JSON array explaining them.
--
-- No breaking changes — does not alter any existing table.

-- ── Table 1: daily metrics ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_metrics_daily (
  id                       BIGSERIAL    PRIMARY KEY,
  date                     DATE         NOT NULL,
  restaurant_id            UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- Activity
  scans_count              INTEGER      NOT NULL DEFAULT 0,
  unique_customers_scanned INTEGER      NOT NULL DEFAULT 0,
  registrations_count      INTEGER      NOT NULL DEFAULT 0,
  rewards_triggered_count  INTEGER      NOT NULL DEFAULT 0,

  -- Snapshot totals (point-in-time, captured at cron run)
  active_customers_30d     INTEGER      NOT NULL DEFAULT 0,
  total_customers          INTEGER      NOT NULL DEFAULT 0,
  wallet_passes_issued     INTEGER      NOT NULL DEFAULT 0,

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (date, restaurant_id)
);

-- Index for timeline queries per restaurant (detail page trend chart)
CREATE INDEX IF NOT EXISTS restaurant_metrics_daily_restaurant_date_idx
  ON restaurant_metrics_daily (restaurant_id, date DESC);

-- Index for cross-restaurant queries on a given date (admin list page)
CREATE INDEX IF NOT EXISTS restaurant_metrics_daily_date_idx
  ON restaurant_metrics_daily (date DESC);

-- ── Table 2: health snapshots ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_health_snapshot (
  restaurant_id    UUID         PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  computed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Scores, each 0-100
  health_score     INTEGER      NOT NULL DEFAULT 0,   -- overall engagement / activity
  upgrade_score    INTEGER      NOT NULL DEFAULT 0,   -- likelihood to upgrade (free plan only)
  churn_risk_score INTEGER      NOT NULL DEFAULT 0,   -- risk of going inactive

  -- Human-readable explanations for each score
  reasons          JSONB        NOT NULL DEFAULT '[]'::jsonb
);

-- ── Verification ──────────────────────────────────────────────────────────────
-- After running, verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('restaurant_metrics_daily', 'restaurant_health_snapshot');
--
-- Expected output: 2 rows.
