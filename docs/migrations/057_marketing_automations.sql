-- ═══════════════════════════════════════════════════════════════════════════
-- 057 — Automations marketing : relance automatique des inactifs (win-back)
--
-- L'activation utilise la colonne EXISTANTE loyalty_settings.notify_inactive
-- (toggle 😴 « Client inactif » de l'onglet Fidélité — présent dans l'UI et
-- sauvegardé depuis mars, mais jamais consommé par aucun backend jusqu'ici).
--
-- 1. winback_days : seuil d'inactivité configurable (45 jours par défaut).
-- 2. Journal automation_sends : déduplication des envois d'automations
--    (un client n'est jamais relancé deux fois dans la période de cooldown).
--    Table technique accédée uniquement via service role → RLS deny-all.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE loyalty_settings
  ADD COLUMN IF NOT EXISTS winback_days integer NOT NULL DEFAULT 45;

CREATE TABLE IF NOT EXISTS automation_sends (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type          text NOT NULL,                 -- 'winback', extensible
  sent_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_sends_lookup
  ON automation_sends (restaurant_id, customer_id, type, sent_at DESC);

-- Deny-all : aucune policy → seul le service role (cron) lit/écrit.
ALTER TABLE automation_sends ENABLE ROW LEVEL SECURITY;
