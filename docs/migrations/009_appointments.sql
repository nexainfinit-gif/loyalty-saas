-- ═══════════════════════════════════════════════════════
-- MODULE RENDEZ-VOUS — SUPABASE MIGRATION
-- ═══════════════════════════════════════════════════════

-- Services (Coupe homme, Brushing, Couleur, etc.)
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_restaurant ON services(restaurant_id);

-- Staff members
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  service_ids UUID[] DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_restaurant ON staff_members(restaurant_id);

-- Staff weekly availability (recurring schedule)
CREATE TABLE IF NOT EXISTS staff_availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_working BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(staff_id, day_of_week)
);

CREATE INDEX idx_availability_staff ON staff_availability(staff_id);

-- Staff time off (specific dates)
CREATE TABLE IF NOT EXISTS staff_time_off (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, date)
);

CREATE INDEX idx_timeoff_staff_date ON staff_time_off(staff_id, date);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  client_id UUID,
  staff_id UUID NOT NULL REFERENCES staff_members(id),
  service_id UUID NOT NULL REFERENCES services(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no_show')),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_restaurant_date ON appointments(restaurant_id, date);
CREATE INDEX idx_appointments_staff_date ON appointments(staff_id, date);
CREATE INDEX idx_appointments_client ON appointments(client_id);

-- Appointment reminders
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'email' CHECK (type IN ('email', 'sms')),
  sent_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_appointment ON appointment_reminders(appointment_id);

-- Appointment settings (one per restaurant)
CREATE TABLE IF NOT EXISTS appointment_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 15,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  max_advance_days INTEGER NOT NULL DEFAULT 30,
  min_advance_hours INTEGER NOT NULL DEFAULT 2,
  allow_cancellation BOOLEAN NOT NULL DEFAULT true,
  cancellation_deadline_hours INTEGER NOT NULL DEFAULT 24,
  confirmation_message TEXT,
  reminder_hours_before INTEGER NOT NULL DEFAULT 24,
  auto_loyalty_points BOOLEAN NOT NULL DEFAULT false,
  loyalty_points_per_visit INTEGER NOT NULL DEFAULT 10,
  working_days INTEGER[] DEFAULT '{1,2,3,4,5,6}',
  opening_time TIME NOT NULL DEFAULT '09:00',
  closing_time TIME NOT NULL DEFAULT '19:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (restaurant_id scope — matches loyalty-saas pattern)
CREATE POLICY "services_restaurant" ON services
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

CREATE POLICY "staff_restaurant" ON staff_members
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

CREATE POLICY "availability_restaurant" ON staff_availability
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

CREATE POLICY "timeoff_restaurant" ON staff_time_off
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

CREATE POLICY "appointments_restaurant" ON appointments
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

CREATE POLICY "reminders_restaurant" ON appointment_reminders
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

CREATE POLICY "settings_restaurant" ON appointment_settings
  USING (restaurant_id = auth.uid())
  WITH CHECK (restaurant_id = auth.uid());

-- Public read access for booking page (services + staff + availability)
CREATE POLICY "services_public_read" ON services
  FOR SELECT USING (active = true);

CREATE POLICY "staff_public_read" ON staff_members
  FOR SELECT USING (active = true);

CREATE POLICY "availability_public_read" ON staff_availability
  FOR SELECT USING (true);

CREATE POLICY "appointments_public_insert" ON appointments
  FOR INSERT WITH CHECK (true);
