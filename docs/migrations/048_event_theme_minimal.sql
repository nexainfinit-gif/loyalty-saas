-- 048: 4e thème d'événement « minimal » (sobre UI/UX type Apple/Uber/Airbnb).
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_theme_check;
ALTER TABLE events ADD CONSTRAINT events_theme_check
  CHECK (theme IN ('nuit', 'corporate', 'musee', 'minimal'));
