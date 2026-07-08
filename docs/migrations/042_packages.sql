-- 042 — Forfaits prépayés (packages de séances)
-- Le commerçant définit des offres (ex. « 5 coupes »), le client les achète en
-- ligne (paiement sur le compte Stripe CONNECTÉ du commerçant, comme les bons
-- cadeaux), puis présente un code que le commerçant décrémente séance par séance.

-- Catalogue d'offres du commerçant.
CREATE TABLE IF NOT EXISTS packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sessions_count integer NOT NULL CHECK (sessions_count >= 1),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_packages_restaurant ON packages(restaurant_id, active);

-- Forfaits achetés (instances client). sessions_used décrémente à chaque usage.
CREATE TABLE IF NOT EXISTS customer_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  name text NOT NULL,                       -- snapshot du nom de l'offre
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  sessions_total integer NOT NULL,
  sessions_used integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','active','depleted','cancelled')),
  stripe_checkout_session_id text,
  purchased_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_packages_restaurant
  ON customer_packages(restaurant_id, status);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_packages ENABLE ROW LEVEL SECURITY;
