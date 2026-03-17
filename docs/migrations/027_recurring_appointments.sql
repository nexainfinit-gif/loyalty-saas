-- 027_recurring_appointments.sql
-- Recurring appointments: link individual instances via parent_id.
-- Expansion happens at creation time (N rows inserted).

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT DEFAULT 'none'
    CHECK (recurrence_pattern IN ('none', 'weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_parent
  ON appointments(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;
