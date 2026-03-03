-- Migration 007 — restaurant_metrics (latest KPI snapshot per restaurant)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.
--
-- Purpose:
--   Adds one table and one batch-compute SQL function used by
--   POST /api/cron/metrics (runs nightly at 02:00 UTC).
--
--   restaurant_metrics
--     One row per restaurant. Upserted on every cron run.
--     Stores latest computed KPI values so the dashboard can read
--     pre-computed data without running heavy aggregations at request time.
--
--   compute_restaurant_metrics_batch()
--     A single SQL function that returns all metrics for every restaurant
--     in one DB round-trip. Called exclusively by the cron job.
--
-- Dependencies (must exist before running):
--   - restaurants, customers, transactions, wallet_passes tables
--   - restaurants.id (uuid pk)
--   - customers.restaurant_id, .created_at, .last_visit_at, .total_visits
--   - transactions.restaurant_id, .customer_id, .created_at, .type, .stamps_delta
--   - wallet_passes.restaurant_id, .status

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_metrics (
  restaurant_id         uuid         PRIMARY KEY
                                     REFERENCES restaurants(id) ON DELETE CASCADE,

  -- Customer growth
  total_customers       integer      NOT NULL DEFAULT 0,
  new_customers_30d     integer      NOT NULL DEFAULT 0,

  -- Engagement
  active_customers_30d  integer      NOT NULL DEFAULT 0,  -- visited in last 30d
  visits_30d            integer      NOT NULL DEFAULT 0,  -- total scan transactions
  repeat_rate           numeric(5,2) NOT NULL DEFAULT 0,  -- 0-100 %

  -- Digital wallet
  wallet_passes_issued  integer      NOT NULL DEFAULT 0,
  wallet_active_passes  integer      NOT NULL DEFAULT 0,

  -- Loyalty completions
  completed_cards       integer      NOT NULL DEFAULT 0,  -- stamp card completions (30d)

  -- Revenue (null when avg_ticket not configured)
  estimated_revenue_30d numeric(10,2) NULL,

  -- Freshness
  last_activity_at      timestamptz  NULL,
  last_computed_at      timestamptz  NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Admin list: sort by freshness
CREATE INDEX IF NOT EXISTS idx_rm_last_computed
  ON restaurant_metrics (last_computed_at DESC);

-- Support fast joins in the batch function on large tables
CREATE INDEX IF NOT EXISTS idx_transactions_restaurant_created
  ON transactions (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_restaurant_created
  ON customers (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_passes_restaurant_status
  ON wallet_passes (restaurant_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE restaurant_metrics ENABLE ROW LEVEL SECURITY;

-- Each restaurant owner sees only their own restaurant's metrics.
-- Platform admins use the service-role key (bypasses RLS).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'restaurant_metrics'
      AND policyname = 'rm_owner_select'
  ) THEN
    CREATE POLICY rm_owner_select
      ON restaurant_metrics
      FOR SELECT
      USING (
        restaurant_id IN (
          SELECT id FROM restaurants WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── Batch compute function ────────────────────────────────────────────────────
--
-- Returns one row per restaurant with aggregated KPI data for the last 30 days.
-- Uses CTEs so every aggregate scans its source table exactly once —
-- no per-restaurant correlated sub-queries.
--
-- Columns returned:
--   restaurant_id        — restaurant pk
--   total_customers      — all-time count
--   new_customers_30d    — registered in last 30d
--   active_customers_30d — distinct customers with ≥1 scan in last 30d
--   visits_30d           — total scan transactions in last 30d
--   repeat_visitors_30d  — active customers with total_visits > 1 (returning)
--   wallet_passes_issued — total passes ever created
--   wallet_active_passes — passes with status = 'active'
--   completed_cards_30d  — stamp card completions (stamps_delta < 0) in last 30d
--   last_activity_at     — max(last_visit_at, last transaction created_at)

CREATE OR REPLACE FUNCTION compute_restaurant_metrics_batch()
RETURNS TABLE (
  restaurant_id        uuid,
  total_customers      bigint,
  new_customers_30d    bigint,
  active_customers_30d bigint,
  visits_30d           bigint,
  repeat_visitors_30d  bigint,
  wallet_passes_issued bigint,
  wallet_active_passes bigint,
  completed_cards_30d  bigint,
  last_activity_at     timestamptz
)
LANGUAGE sql
SECURITY DEFINER
-- Stable: result is the same within one transaction (no writes, deterministic for now())
STABLE
AS $$
  WITH
  cutoff AS (
    SELECT now() - INTERVAL '30 days' AS ts
  ),

  -- ── All-time customer totals per restaurant ──────────────────────────────
  cust_agg AS (
    SELECT
      restaurant_id,
      COUNT(*)                                                                AS total,
      COUNT(*) FILTER (WHERE created_at >= (SELECT ts FROM cutoff))          AS new_30d,
      MAX(last_visit_at)                                                      AS last_visit
    FROM customers
    GROUP BY restaurant_id
  ),

  -- ── Transaction aggregates (last 30d) per restaurant ────────────────────
  tx_agg AS (
    SELECT
      restaurant_id,
      COUNT(*) FILTER (WHERE type = 'scan')                                  AS visits,
      COUNT(DISTINCT customer_id) FILTER (WHERE type = 'scan')               AS active_cust,
      -- stamp card completions: stamps_delta < 0 means reward issued
      COUNT(*) FILTER (WHERE stamps_delta < 0)                               AS completed,
      MAX(created_at)                                                         AS last_tx
    FROM transactions
    WHERE created_at >= (SELECT ts FROM cutoff)
    GROUP BY restaurant_id
  ),

  -- ── Returning customers: active in window AND have visited before ────────
  -- "returning" = has more than 1 total_visits recorded on the customer row
  repeat_agg AS (
    SELECT
      t.restaurant_id,
      COUNT(DISTINCT t.customer_id) AS cnt
    FROM transactions t
    JOIN customers c ON c.id = t.customer_id
    WHERE t.created_at >= (SELECT ts FROM cutoff)
      AND t.type = 'scan'
      AND c.total_visits > 1
    GROUP BY t.restaurant_id
  ),

  -- ── Wallet pass counts per restaurant ───────────────────────────────────
  wallet_agg AS (
    SELECT
      restaurant_id,
      COUNT(*)                                          AS total_issued,
      COUNT(*) FILTER (WHERE status = 'active')        AS active_cnt
    FROM wallet_passes
    GROUP BY restaurant_id
  )

  SELECT
    r.id                                          AS restaurant_id,
    COALESCE(ca.total,          0)                AS total_customers,
    COALESCE(ca.new_30d,        0)                AS new_customers_30d,
    COALESCE(ta.active_cust,    0)                AS active_customers_30d,
    COALESCE(ta.visits,         0)                AS visits_30d,
    COALESCE(ra.cnt,            0)                AS repeat_visitors_30d,
    COALESCE(wa.total_issued,   0)                AS wallet_passes_issued,
    COALESCE(wa.active_cnt,     0)                AS wallet_active_passes,
    COALESCE(ta.completed,      0)                AS completed_cards_30d,
    GREATEST(ca.last_visit, ta.last_tx)           AS last_activity_at

  FROM restaurants r
  LEFT JOIN cust_agg   ca ON ca.restaurant_id = r.id
  LEFT JOIN tx_agg     ta ON ta.restaurant_id = r.id
  LEFT JOIN repeat_agg ra ON ra.restaurant_id = r.id
  LEFT JOIN wallet_agg wa ON wa.restaurant_id = r.id
$$;

-- ── Verification ──────────────────────────────────────────────────────────────
-- After running, verify with:
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name = 'restaurant_metrics';
--
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_name = 'compute_restaurant_metrics_batch';
--
--   SELECT compute_restaurant_metrics_batch();  -- should return one row per restaurant
