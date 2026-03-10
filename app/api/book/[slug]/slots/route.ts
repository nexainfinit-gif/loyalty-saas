import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'book-slots', limit: 60, windowMs: 60_000 });

/**
 * GET /api/book/[slug]/slots?date=YYYY-MM-DD&staffId=xxx&serviceId=xxx
 *
 * Public endpoint — returns available time slots for a given date/staff/service.
 * Considers:
 *   - staff availability (day_of_week schedule)
 *   - staff time off
 *   - existing appointments (conflict detection)
 *   - buffer time between appointments
 *   - business opening/closing hours
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const staffId = searchParams.get('staffId');
  const serviceId = searchParams.get('serviceId');

  if (!date || !staffId || !serviceId) {
    return NextResponse.json(
      { error: 'Paramètres manquants : date, staffId, serviceId.' },
      { status: 400 },
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Format de date invalide.' }, { status: 400 });
  }

  // 1. Resolve restaurant
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }

  // 2. Fetch service duration
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('duration_minutes')
    .eq('id', serviceId)
    .eq('restaurant_id', restaurant.id)
    .eq('active', true)
    .single();

  if (!service) {
    return NextResponse.json({ error: 'Service introuvable.' }, { status: 404 });
  }

  // 3. Parallel fetch: settings, staff availability, time off, existing appointments
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay(); // 0=Sunday

  const [settingsRes, availRes, timeOffRes, appointmentsRes] = await Promise.all([
    supabaseAdmin
      .from('appointment_settings')
      .select('slot_duration_minutes, buffer_minutes, opening_time, closing_time, working_days')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle(),

    supabaseAdmin
      .from('staff_availability')
      .select('start_time, end_time, is_working')
      .eq('staff_id', staffId)
      .eq('restaurant_id', restaurant.id)
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
      .select('start_time, end_time')
      .eq('staff_id', staffId)
      .eq('restaurant_id', restaurant.id)
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

  // 4. Generate time slots
  const slotDuration = service.duration_minutes;
  const bufferMinutes = settings.buffer_minutes;
  const existingAppts = appointmentsRes.data ?? [];

  // Use the later of business opening / staff start
  const openTime = laterTime(settings.opening_time, staffSchedule.start_time);
  // Use the earlier of business closing / staff end
  const closeTime = earlierTime(settings.closing_time, staffSchedule.end_time);

  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);

  // Current time check (don't show past slots for today)
  const now = new Date();
  const isToday =
    dateObj.getFullYear() === now.getFullYear() &&
    dateObj.getMonth() === now.getMonth() &&
    dateObj.getDate() === now.getDate();
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  const slots: { time: string; available: boolean }[] = [];

  for (let m = openMinutes; m + slotDuration <= closeMinutes; m += settings.slot_duration_minutes) {
    // Skip past slots
    if (m < nowMinutes) continue;

    const slotStartMin = m;
    const slotEndMin = m + slotDuration;

    // Check conflicts with existing appointments (including buffer)
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
