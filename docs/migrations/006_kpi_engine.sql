-- ============================================================
-- Migration 006 — Configurable KPI Engine
-- Run once in Supabase SQL editor.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================

-- 1. KPI catalog
CREATE TABLE IF NOT EXISTS kpis (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        UNIQUE NOT NULL,
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  category    text        NOT NULL DEFAULT 'growth'
                          CHECK (category IN ('growth', 'retention', 'revenue', 'engagement')),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Plan ↔ KPI access mapping
CREATE TABLE IF NOT EXISTS plan_kpis (
  plan_id  uuid    NOT NULL REFERENCES plans(id)  ON DELETE CASCADE,
  kpi_id   uuid    NOT NULL REFERENCES kpis(id)   ON DELETE CASCADE,
  enabled  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plan_id, kpi_id)
);

-- 3. Per-restaurant configuration inputs (arbitrary key/value pairs)
CREATE TABLE IF NOT EXISTS restaurant_settings (
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  key           text NOT NULL,
  value         text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS plan_kpis_plan_idx ON plan_kpis (plan_id);
CREATE INDEX IF NOT EXISTS plan_kpis_kpi_idx  ON plan_kpis (kpi_id);
CREATE INDEX IF NOT EXISTS restaurant_settings_restaurant_idx
  ON restaurant_settings (restaurant_id);

-- 4. Seed default KPI catalog
INSERT INTO kpis (key, name, description, category) VALUES
  ('total_customers',        'Total clients',               'Nombre total de clients inscrits',                       'growth'),
  ('new_customers_30d',      'Nouveaux clients (30j)',      'Clients inscrits dans les 30 derniers jours',            'growth'),
  ('active_customers_30d',   'Clients actifs (30j)',        'Clients ayant scanné au moins une fois sur 30 jours',    'retention'),
  ('churn_rate_30d',         'Taux de churn (30j)',         'Part de clients inactifs depuis plus de 30 jours',       'retention'),
  ('retention_rate_90d',     'Rétention 90 jours',         'Part de clients ayant scanné au moins 2 fois en 90j',    'retention'),
  ('total_scans',            'Total scans',                 'Nombre total de scans effectués',                        'engagement'),
  ('scans_per_customer',     'Scans par client',            'Moyenne de scans par client actif',                      'engagement'),
  ('rewards_issued',         'Récompenses déclenchées',    'Nombre de récompenses émises sur la période',             'engagement'),
  ('avg_days_between_visits','Fréquence visite (jours)',   'Intervalle moyen entre deux visites d''un même client',   'retention'),
  ('wallet_pass_rate',       'Taux adoption Wallet',        'Part de clients ayant un pass Wallet actif',             'engagement'),
  ('revenue_estimate',       'CA estimé (période)',         'Estimation du chiffre d''affaires basée sur ticket moyen','revenue'),
  ('revenue_per_customer',   'CA par client',               'CA estimé divisé par le nombre de clients actifs',       'revenue'),
  ('avg_ticket',             'Ticket moyen',                'Valeur moyenne d''une transaction (saisie manuelle)',     'revenue'),
  ('ltv_estimate',           'LTV estimée',                 'Valeur vie client estimée (ticket x fréquence x durée)', 'revenue'),
  ('campaign_reach',         'Portée campagnes email',      'Nombre de destinataires uniques touchés par email',       'growth')
ON CONFLICT (key) DO NOTHING;

-- 5. Seed plan_kpis: free plan — growth + engagement only (no revenue KPIs)
INSERT INTO plan_kpis (plan_id, kpi_id, enabled)
SELECT
  p.id AS plan_id,
  k.id AS kpi_id,
  CASE WHEN k.category IN ('growth', 'engagement') THEN true ELSE false END AS enabled
FROM plans p
CROSS JOIN kpis k
WHERE p.key = 'free'
ON CONFLICT DO NOTHING;

-- 6. Seed plan_kpis: pro plan — all KPIs enabled
INSERT INTO plan_kpis (plan_id, kpi_id, enabled)
SELECT
  p.id AS plan_id,
  k.id AS kpi_id,
  true  AS enabled
FROM plans p
CROSS JOIN kpis k
WHERE p.key = 'pro'
ON CONFLICT DO NOTHING;
