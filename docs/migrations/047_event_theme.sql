-- 047: Thème de présentation PAR ÉVÉNEMENT (remplace le KV events_theme
-- par organisateur — un même organisateur peut tenir un concert ET un
-- séminaire). Thèmes : nuit (défaut) / corporate / musee.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'nuit'
  CHECK (theme IN ('nuit', 'corporate', 'musee'));

COMMENT ON COLUMN events.theme IS
  'Thème de la page publique/billets pour cet événement (047)';

-- Nettoyage de l''ancien réglage par organisateur (plus lu par le code).
DELETE FROM restaurant_settings WHERE key = 'events_theme';
