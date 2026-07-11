-- 052 — Opt-in marketing des acheteurs de billets (campagnes d'annonce
-- d'événements). RGPD : case NON cochée par défaut à l'achat ; le
-- désabonnement (lien dans chaque email) remet le flag à false pour
-- toutes les lignes du même email chez le même organisateur.

ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false;

-- Audience des campagnes : emails opt-in distincts par organisateur
CREATE INDEX IF NOT EXISTS idx_event_tickets_marketing
  ON event_tickets(restaurant_id, buyer_email)
  WHERE marketing_opt_in;
