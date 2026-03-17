import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'reschedule-slots', limit: 60, windowMs: 60_000 });

/**
 * GET /api/book/reschedule/[token]/slots?date=YYYY-MM-DD
 *
 * Public endpoint — returns available time slots for rescheduling.
 * Uses the same logic as /api/book/[slug]/slots but authenticates via cancel_token.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const { token } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'Paramètre manquant : date.' }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Format de date invalide.' }, { status: 400 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });
  }

  // Look up appointment to get staff_id, service_id, restaurant_id
  const { data: appointment, error: aptErr } = await supabaseAdmin
    .from('appointments')
    .select('id, restaurant_id, staff_id, service_id')
    .eq('cancel_token', token)
    .single();

  if (aptErr || !appointment) {
    return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });
  }

  const { restaurant_id, staff_id: staffId, service_id: serviceId } = appointment;

  // Fetch service duration
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('duration_minutes')
    .eq('id', serviceId)
    .eq('restaurant_id', restaurant_id)
    .eq('active', true)
    .single();

  if (!service) {
    return NextResponse.json({ error: 'Service introuvable.' }, { status: 404 });
  }

  // Parallel fetch: settings, staff availability, time off, existing appointments
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();

  const [settingsRes, availRes, timeOffRes, appointmentsRes] = await Promise.all([
    supabaseAdmin
      .from('appointment_settings')
      .select('slot_duration_minutes, buffer_minutes, opening_time, closing_time, working_days')
      .eq('restaurant_id', restaurant_id)
      .maybeSingle(),
    supabaseAdmin
      .from('staff_availability')
      .select('start_time, end_time, is_working')
      .eq('staff_id', staffId)
      .eq('restaurant_id', restaurant_id)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle(),
    supabaseAdmin
      .from('staff_time_off')
      .select('id')
      .eq('staff_id', staffId)
      .eq('date', date)
      .maybeSingle(),
    supabaseAdmin
      .from('appointments')
      .select('id, start_time, end_time')
      .eq('staff_id', staffId)
      .eq('restaurant_id', restaurant_id)
      .eq('date', date)
      .in('status', ['confirmed']),
  ]);

  const settings = settingsRes.data ?? {
    slot_duration_minutes: 15,
    buffer_minutes: 0,
    opening_time: '09:00',
    closing_time: '19:00',
    working_days: [1, 2, 3, 4, 5, 6],
  };

  // Check if business is open on this day
  if (!settings.working_days.includes(dayOfWeek)) {
    return NextResponse.json({ slots: [] });
  }

  // Check if staff member is off
  if (timeOffRes.data) {
    return NextResponse.json({ slots: [] });
  }

  // Check staff availability for this day
  const staffSchedule = availRes.data;
  if (!staffSchedule || !staffSchedule.is_working) {
    return NextResponse.json({ slots: [] });
  }

  // Generate time slots
  const slotDuration = service.duration_minutes;
  const bufferMinutes = settings.buffer_minutes;
  // Exclude the current appointment from conflicts (we're rescheduling it)
  const existingAppts = (appointmentsRes.data ?? []).filter((a) => a.id !== appointment.id);

  const openTime = laterTime(settings.opening_time, staffSchedule.start_time);
  const closeTime = earlierTime(settings.closing_time, staffSchedule.end_time);

  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);

  // Current time check
  const now = new Date();
  const isToday =
    dateObj.getFullYear() === now.getFullYear() &&
    dateObj.getMonth() === now.getMonth() &&
    dateObj.getDate() === now.getDate();
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  const slots: { time: string; available: boolean }[] = [];

  for (let m = openMinutes; m + slotDuration <= closeMinutes; m += settings.slot_duration_minutes) {
    if (m < nowMinutes) continue;

    const slotStartMin = m;
    const slotEndMin = m + slotDuration;

    const hasConflict = existingAppts.some((appt) => {
      const apptStart = timeToMinutes(appt.start_time);
      const apptEnd = timeToMinutes(appt.end_time) + bufferMinutes;
      return slotStartMin < apptEnd && slotEndMin > apptStart;
    });

    slots.push({
      time: minutesToTime(m),
      available: !hasConflict,
    });
  }

  return NextResponse.json({ slots });
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function laterTime(a: string, b: string): string {
  return timeToMinutes(a) >= timeToMinutes(b) ? a : b;
}

function earlierTime(a: string, b: string): string {
  return timeToMinutes(a) <= timeToMinutes(b) ? a : b;
}
