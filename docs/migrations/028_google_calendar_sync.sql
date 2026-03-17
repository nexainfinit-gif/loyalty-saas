-- 028_google_calendar_sync.sql
-- Google Calendar integration: OAuth tokens on restaurants, event IDs on appointments.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS google_calendar_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
