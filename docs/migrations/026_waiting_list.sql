-- 026_waiting_list.sql
-- Waiting list: clients can join a queue when no slots are available.
-- When an appointment is cancelled, matching entries are notified.

CREATE TABLE IF NOT EXISTS waiting_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  service_id    UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id      UUID REFERENCES staff_members(id) ON DELETE SET NULL,   -- NULL = any staff
  desired_date  DATE NOT NULL,
  client_name   TEXT NOT NULL,
  client_email  TEXT NOT NULL,
  client_phone  TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')),
  notified_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,    -- auto-expire notification after X hours
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_waiting_list_restaurant ON waiting_list(restaurant_id);
CREATE INDEX idx_waiting_list_lookup ON waiting_list(restaurant_id, desired_date, status);
CREATE INDEX idx_waiting_list_email ON waiting_list(restaurant_id, client_email);
