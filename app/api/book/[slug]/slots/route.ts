import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isBookingEligible } from '@/lib/booking-eligibility';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { computeSlots, timeToMinutes, laterTime, earlierTime } from '@/lib/slots';

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
    .select('id, business_type')
    .eq('slug', slug)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }
  // Réservation limitée aux activités de prestation (coiffure, beauté, spa…)
  // — jamais cafés/restaurants (fidélité seule pour eux). Gate serveur.
  if (!isBookingEligible(restaurant.business_type)) {
    return NextResponse.json({ error: "La réservation en ligne n'est pas disponible pour cet établissement." }, { status: 404 });
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
      .in('status', ['confirmed', 'pending_payment']),
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

  // Current time check (don't show past slots for today)
  const now = new Date();
  const isToday =
    dateObj.getFullYear() === now.getFullYear() &&
    dateObj.getMonth() === now.getMonth() &&
    dateObj.getDate() === now.getDate();
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  // ── Multiplicateurs de points actifs ce jour-là (synergie fidélité) ──
  // Un créneau couvert par un multiplicateur est badgé « points ×N » sur la
  // page publique → incite à réserver les heures creuses.
  // (dayOfWeek déjà déclaré plus haut pour les disponibilités staff.)
  const { data: multipliers } = await supabaseAdmin
    .from('point_multipliers')
    .select('multiplier, day_of_week, start_time, end_time')
    .eq('restaurant_id', restaurant.id)
    .eq('active', true);

  const multiplierFor = (slotMin: number): number | undefined => {
    for (const mult of multipliers ?? []) {
      if (mult.day_of_week !== null && mult.day_of_week !== dayOfWeek) continue;
      const from = mult.start_time ? timeToMinutes(String(mult.start_time).slice(0, 5)) : 0;
      const to   = mult.end_time   ? timeToMinutes(String(mult.end_time).slice(0, 5))   : 24 * 60;
      if (slotMin >= from && slotMin < to && (mult.multiplier ?? 1) > 1) return mult.multiplier;
    }
    return undefined;
  };

  // Calcul des créneaux (logique pure partagée) + annotation multiplicateur.
  const slots = computeSlots({
    serviceDuration: slotDuration,
    slotStep: settings.slot_duration_minutes,
    bufferMinutes,
    openTime,
    closeTime,
    existing: existingAppts,
    nowMinutes,
  }).map((s) => {
    const mult = multiplierFor(timeToMinutes(s.time));
    return mult ? { ...s, multiplier: mult } : s;
  });

  return NextResponse.json({ slots });
}
