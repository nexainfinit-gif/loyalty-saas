-- 049: Catégories de billets + tables VIP (T3)
-- Un événement peut proposer plusieurs tarifs (« Early bird », « Standard »,
-- « VIP »…). Une catégorie kind='vip_table' vend des TABLES : 1 unité =
-- 1 billet (un seul QR pour le groupe) couvrant seats_per_unit places.
-- Rétro-compatible : un événement SANS catégorie continue d'utiliser
-- events.price (tarif unique).

CREATE TABLE IF NOT EXISTS event_ticket_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  capacity        INT,                        -- NULL = illimité (dans la limite de l'événement)
  kind            TEXT NOT NULL DEFAULT 'standard'
    CHECK (kind IN ('standard', 'vip_table')),
  seats_per_unit  INT NOT NULL DEFAULT 1 CHECK (seats_per_unit BETWEEN 1 AND 20),
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_ticket_tiers_event ON event_ticket_tiers(event_id, is_active, sort_order);

-- Billets : rattachement à la catégorie (dénormalisé pour l'affichage même
-- si la catégorie est modifiée/supprimée) + nombre de places couvertes.
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS tier_id   UUID REFERENCES event_ticket_tiers(id) ON DELETE SET NULL;
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS tier_name TEXT;
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS seats     INT NOT NULL DEFAULT 1;

-- Accès service-role uniquement (comme 046).
ALTER TABLE event_ticket_tiers ENABLE ROW LEVEL SECURITY;
