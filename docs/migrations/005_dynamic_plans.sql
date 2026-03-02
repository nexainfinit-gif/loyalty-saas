-- ============================================================
-- Migration 005 — Dynamic Subscription Plans
-- Run once in Supabase SQL editor.
-- ============================================================

-- 1. Plans catalog
CREATE TABLE IF NOT EXISTS plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text UNIQUE NOT NULL,
  name           text NOT NULL,
  price_monthly  integer NULL,         -- centimes, e.g. 2900 = 29,00 €
  is_public      boolean NOT NULL DEFAULT true,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- 2. Per-plan feature toggles
CREATE TABLE IF NOT EXISTS plan_features (
  plan_id      uuid REFERENCES plans(id) ON DELETE CASCADE,
  feature_key  text NOT NULL,
  enabled      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plan_id, feature_key)
);

-- 3. Add plan_id FK to restaurants (nullable during migration)
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES plans(id);

-- 4. Seed default plans
INSERT INTO plans (key, name, price_monthly, is_public, sort_order) VALUES
  ('free', 'Gratuit',  0,    true, 0),
  ('pro',  'Pro',      2900, true, 1)
ON CONFLICT (key) DO NOTHING;

-- 5. Seed default features for free plan
INSERT INTO plan_features (plan_id, feature_key, enabled)
SELECT id, unnest(ARRAY[
  'wallet_studio', 'campaigns_email', 'analytics', 'export_csv', 'scanner_staff'
]), unnest(ARRAY[false, true, false, true, true])
FROM plans WHERE key = 'free'
ON CONFLICT DO NOTHING;

-- 6. Seed default features for pro plan (everything on)
INSERT INTO plan_features (plan_id, feature_key, enabled)
SELECT id, unnest(ARRAY[
  'wallet_studio', 'campaigns_email', 'analytics', 'export_csv', 'scanner_staff'
]), unnest(ARRAY[true, true, true, true, true])
FROM plans WHERE key = 'pro'
ON CONFLICT DO NOTHING;

-- 7. Backfill: map restaurants.plan string -> plan_id
UPDATE restaurants r
SET    plan_id = p.id
FROM   plans p
WHERE  r.plan = p.key
  AND  r.plan_id IS NULL;

-- 8. Any remaining restaurants (unknown plan string) → free
UPDATE restaurants
SET    plan_id = (SELECT id FROM plans WHERE key = 'free')
WHERE  plan_id IS NULL;

-- restaurants.plan column is intentionally kept for backward compat display.
