-- ═══════════════════════════════════════════════════════
-- NO-SHOW TRACKING & REMINDER SYSTEM — SUPABASE MIGRATION
-- ═══════════════════════════════════════════════════════

-- Track no-shows per client (by email, per restaurant)
-- We use email as the client identifier since public bookings
-- don't require a customer account (client_id is nullable).
CREATE TABLE IF NOT EXISTS client_no_show_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  client_email TEXT NOT NULL,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  last_no_show_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, client_email)
);

CREATE INDEX idx_noshow_stats_restaurant ON client_no_show_stats(restaurant_id);
CREATE INDEX idx_noshow_stats_email ON client_no_show_stats(restaurant_id, client_email);

-- Add index on appointment_reminders for the cron to efficiently find unsent reminders
CREATE INDEX IF NOT EXISTS idx_reminders_pending
  ON appointment_reminders(scheduled_for)
  WHERE sent_at IS NULL;

-- Atomic increment function (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_no_show(
  p_restaurant_id UUID,
  p_client_email TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO client_no_show_stats (restaurant_id, client_email, no_show_count, last_no_show_at)
  VALUES (p_restaurant_id, p_client_email, 1, now())
  ON CONFLICT (restaurant_id, client_email)
  DO UPDATE SET
    no_show_count = client_no_show_stats.no_show_count + 1,
    last_no_show_at = now();
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE client_no_show_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "noshow_stats_restaurant" ON client_no_show_stats
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

-- Public read access for booking page (check no-show count before booking)
CREATE POLICY "noshow_stats_public_read" ON client_no_show_stats
  FOR SELECT USING (true);
