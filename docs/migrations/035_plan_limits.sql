-- 035: Numeric plan limits — consolidation to a single source of truth (DB)
--
-- Contexte : les limites étaient hardcodées dans lib/plan-limits.ts avec des
-- clés de plan périmées (free/starter/pro) alors que la DB vivante contient
-- starter/growth/pro. Résultat : un restaurant "growth" retombait sur les
-- limites "free" (100 clients, 2 campagnes/mois) — bug actif.
--
-- Valeurs validées le 2026-07-05 (modèle de rentabilité, cible marge brute
-- 66 % au pire cas, coût email 0,40 €/1000) :
--   starter (24,99 €) : 3 templates,  8 campagnes/mois,   500 clients  (~89 %)
--   growth  (39,99 €) : 10 templates, 12 campagnes/mois, 2 000 clients (~72 %)
--   pro     (69,00 €) : ∞ templates,  15 campagnes/mois, 4 000 clients (~63 % pire cas, ~80 % réaliste)
--
-- NULL = illimité.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_templates            integer,
  ADD COLUMN IF NOT EXISTS max_campaigns_per_month  integer,
  ADD COLUMN IF NOT EXISTS max_customers            integer;

UPDATE plans SET max_templates = 3,    max_campaigns_per_month = 8,  max_customers = 500  WHERE key = 'starter';
UPDATE plans SET max_templates = 10,   max_campaigns_per_month = 12, max_customers = 2000 WHERE key = 'growth';
UPDATE plans SET max_templates = NULL, max_campaigns_per_month = 15, max_customers = 4000 WHERE key = 'pro';
