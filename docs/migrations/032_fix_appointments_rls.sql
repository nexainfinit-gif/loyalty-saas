-- 032: Fix broken RLS policies from migration 009 (appointments module)
--
-- Problème : les policies de 009 utilisaient `restaurant_id = auth.uid()`,
-- ce qui est toujours faux — restaurant_id est l'id du restaurant, jamais
-- l'uid du propriétaire. Résultat : aucun accès owner via le rôle
-- authenticated (masqué en pratique car les routes API utilisent le
-- service role, qui bypasse RLS).
--
-- Correctif : recréer chaque policy avec le pattern standard du projet
-- (identique aux migrations 013, 015, 018, 019, 020) :
--   restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
--
-- Les policies public_read de 009 (booking page) sont conservées telles quelles.

DO $$
DECLARE
  t TEXT;
  p TEXT;
BEGIN
  FOR t, p IN
    SELECT * FROM (VALUES
      ('services',              'services_restaurant'),
      ('staff_members',         'staff_restaurant'),
      ('staff_availability',    'availability_restaurant'),
      ('staff_time_off',        'timeoff_restaurant'),
      ('appointments',          'appointments_restaurant'),
      ('appointment_reminders', 'reminders_restaurant'),
      ('appointment_settings',  'settings_restaurant')
    ) AS v(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()))
         WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()))',
      p, t
    );
  END LOOP;
END $$;
