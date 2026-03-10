// ═══════════════════════════════════
// APPOINTMENTS MODULE TYPES
// ═══════════════════════════════════

export type AppointmentStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export interface Service {
  id: string
  restaurant_id: string
  name: string
  duration_minutes: number
  price: number
  category: string
  active: boolean
  created_at: string
}

export interface StaffMember {
  id: string
  restaurant_id: string
  name: string
  email: string
  phone: string | null
  avatar_url: string | null
  service_ids: string[]
  active: boolean
  created_at: string
}

export interface StaffAvailability {
  id: string
  staff_id: string
  restaurant_id: string
  day_of_week: number // 0=Sunday, 1=Monday ... 6=Saturday
  start_time: string  // "09:00"
  end_time: string    // "18:00"
  is_working: boolean
}

export interface StaffTimeOff {
  id: string
  staff_id: string
  restaurant_id: string
  date: string
  reason: string | null
  created_at: string
}

export interface Appointment {
  id: string
  restaurant_id: string
  client_id: string | null
  staff_id: string
  service_id: string
  date: string
  start_time: string   // "10:00"
  end_time: string     // "10:30"
  status: AppointmentStatus
  client_name: string
  client_email: string
  client_phone: string
  notes: string | null
  created_at: string
  // Joined fields
  service?: Service
  staff?: StaffMember
}

export interface AppointmentReminder {
  id: string
  appointment_id: string
  restaurant_id: string
  type: 'email' | 'sms'
  sent_at: string | null
  scheduled_for: string
  created_at: string
}

export interface AppointmentSettings {
  id: string
  restaurant_id: string
  slot_duration_minutes: number
  buffer_minutes: number
  max_advance_days: number
  min_advance_hours: number
  allow_cancellation: boolean
  cancellation_deadline_hours: number
  confirmation_message: string | null
  reminder_hours_before: number
  auto_loyalty_points: boolean
  loyalty_points_per_visit: number
  working_days: number[]       // [1,2,3,4,5]
  opening_time: string         // "09:00"
  closing_time: string         // "19:00"
  created_at: string
}

// ═══════════════════════════════════
// UI TYPES
// ═══════════════════════════════════

export type CalendarView = 'day' | 'week'

export interface TimeSlot {
  time: string
  available: boolean
}

export interface BookingFormData {
  service_id: string
  staff_id: string
  date: string
  time: string
  client_name: string
  client_email: string
  client_phone: string
  notes?: string
}
