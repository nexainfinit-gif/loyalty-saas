-- 045: Profils produit (T0 ticketing)
-- Chaque établissement choisit ses services à l'onboarding :
--   'loyalty'   — programme de fidélité (cartes, scans, campagnes clients)
--   'booking'   — réservations (reste soumis au plan + type d'activité)
--   'ticketing' — billetterie d'événements (standalone possible)
-- Les lignes existantes conservent le comportement actuel (loyalty + booking).
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS products TEXT[] NOT NULL DEFAULT ARRAY['loyalty','booking'];

COMMENT ON COLUMN restaurants.products IS
  'Services choisis par l''établissement : loyalty | booking | ticketing (045)';
