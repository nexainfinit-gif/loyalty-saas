-- 046: Billetterie d'événements (T1)
-- Événements publiés par un établissement + billets vendus (gratuits ou payés
-- sur le compte Stripe Connect du commerçant, avec commission plateforme).
-- Cycle billet : pending_payment → valid (payé/gratuit, email envoyé)
--                → checked_in (scan à l'entrée, T2) | cancelled.

CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ,
  capacity        INT,                          -- NULL = illimité
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 0 = gratuit
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'cancelled', 'ended')),
  -- Option fidélité (hybrides café-concert) : proposer à l'acheteur de créer
  -- sa carte de fidélité à l'achat (opt-in explicite côté acheteur — RGPD).
  offer_loyalty   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_events_restaurant ON events(restaurant_id, status, starts_at);

CREATE TABLE IF NOT EXISTS event_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL UNIQUE,
  buyer_name      TEXT NOT NULL,
  buyer_email     TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,  -- prix payé pour CE billet
  status          TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'valid', 'checked_in', 'cancelled')),
  -- Un achat multi-billets partage la même session Checkout.
  stripe_checkout_session_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ,
  checked_in_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_event_tickets_event ON event_tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_tickets_session ON event_tickets(stripe_checkout_session_id);

-- Accès service-role uniquement (comme 040) : aucune policy publique.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tickets ENABLE ROW LEVEL SECURITY;
