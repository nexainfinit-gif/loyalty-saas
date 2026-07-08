-- 044 — Heure réelle de fin d'un rendez-vous.
-- Posée quand le coiffeur marque « Terminé » dans l'agenda. C'est la matière
-- première de la future bêta « temps réel approximatif » côté client :
-- comparer completed_at à end_time planifié = retard accumulé du praticien.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Requêtes de retard : RDV terminés du jour par praticien.
CREATE INDEX IF NOT EXISTS idx_appointments_completed
  ON appointments(restaurant_id, date, completed_at)
  WHERE completed_at IS NOT NULL;
