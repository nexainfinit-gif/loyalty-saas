-- Migration 024: Demo mode support
-- Adds is_demo flag to restaurants for demo/seed data cleanup.
-- Ensures starter plan exists in plans table.
-- Run in Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════
-- 1. ADD is_demo TO restaurants
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Partial index for fast cleanup queries
CREATE INDEX IF NOT EXISTS idx_restaurants_is_demo
  ON restaurants (is_demo) WHERE is_demo = true;

-- ═══════════════════════════════════════════════════════════════
-- 2. ENSURE starter PLAN EXISTS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO plans (key, name, price_monthly, is_public, is_active, sort_order)
VALUES ('starter', 'Starter', 1490, true, true, 1)
ON CONFLICT (key) DO NOTHING;

-- Ensure starter has same features as pro for demo purposes
-- (adjust after if needed)
INSERT INTO plan_features (plan_id, feature_key, enabled)
SELECT p.id, f.feature_key, true
FROM plans p
CROSS JOIN (VALUES ('wallet_studio'), ('campaigns_email'), ('analytics'), ('export_csv'), ('scanner_staff')) AS f(feature_key)
WHERE p.key = 'starter'
ON CONFLICT (plan_id, feature_key) DO NOTHING;
