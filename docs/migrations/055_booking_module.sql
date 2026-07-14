-- 055 — Rebites Booking en module payant (add-on), découplé du type d'activité.
-- Phase 1 : structure. Le flag booking_active est piloté manuellement pour
-- l'instant ; la facturation Stripe (Phase 2) le basculera automatiquement.

-- Le service Booking est actif (payé) pour cet établissement.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS booking_active boolean NOT NULL DEFAULT false;

-- Ce membre d'équipe gère l'agenda (accès donné à la carte par le gérant).
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS booking_access boolean NOT NULL DEFAULT false;

-- Backfill : les établissements qui utilisent DÉJÀ le booking (types éligibles)
-- restent actifs → on ne casse rien pour les salons existants.
UPDATE restaurants SET booking_active = true
WHERE business_type IN ('salon_coiffure', 'salon_beaute', 'barbershop', 'spa', 'bien_etre');

-- Préserve l'accès agenda des membres d'équipe existants de ces établissements.
UPDATE team_members tm SET booking_access = true
FROM restaurants r
WHERE tm.restaurant_id = r.id AND r.booking_active = true;
