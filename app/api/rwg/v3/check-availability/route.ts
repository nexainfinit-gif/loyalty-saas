import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isBookingEligible } from '@/lib/booking-eligibility';
import { verifyRwgAuth } from '@/lib/reserve-with-google';
import { computeSlots, laterTime, earlierTime } from '@/lib/slots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  merchantId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/rwg/v3/check-availability
 * Renvoie les créneaux DISPONIBLES pour un service/employé/date (temps réel).
 * Réutilise exactement la même logique de créneaux que la page publique.
 */
export async function POST(request: Request) {
  if (!verifyRwgAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { merchantId, serviceId, staffId, date } = parsed.data;

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants').select('id, business_type').eq('id', merchantId).single();
  if (!restaurant || !isBookingEligible(restaurant.business_type)) {
    return NextResponse.json({ availability: [] });
  }

  const { data: service } = await supabaseAdmin
    .from('services').select('duration_minutes')
    .eq('id', serviceId).eq('restaurant_id', merchantId).eq('active', true).single();
  if (!service) return NextResponse.json({ availability: [] });

  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  const [settingsRes, availRes, timeOffRes, apptRes] = await Promise.all([
    supabaseAdmin.from('appointment_settings')
      .select('slot_duration_minutes, buffer_minutes, opening_time, closing_time, working_days')
      .eq('restaurant_id', merchantId).maybeSingle(),
    supabaseAdmin.from('staff_availability')
      .select('start_time, end_time, is_working')
      .eq('staff_id', staffId).eq('restaurant_id', merchantId).eq('day_of_week', dayOfWeek).maybeSingle(),
    supabaseAdmin.from('staff_time_off').select('id').eq('staff_id', staffId).eq('date', date).maybeSingle(),
    supabaseAdmin.from('appointments').select('start_time, end_time')
      .eq('staff_id', staffId).eq('restaurant_id', merchantId).eq('date', date)
      .in('status', ['confirmed', 'pending_payment']),
  ]);

  const settings = settingsRes.data ?? {
    slot_duration_minutes: 15, buffer_minutes: 0, opening_time: '09:00', closing_time: '19:00', working_days: [1, 2, 3, 4, 5, 6],
  };
  const staffSchedule = availRes.data;
  if (!settings.working_days.includes(dayOfWeek) || timeOffRes.data || !staffSchedule?.is_working) {
    return NextResponse.json({ availability: [] });
  }

  const now = new Date();
  const isToday = date === now.toISOString().slice(0, 10);
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  const slots = computeSlots({
    serviceDuration: service.duration_minutes,
    slotStep: settings.slot_duration_minutes,
    bufferMinutes: settings.buffer_minutes,
    openTime: laterTime(settings.opening_time, staffSchedule.start_time),
    closeTime: earlierTime(settings.closing_time, staffSchedule.end_time),
    existing: apptRes.data ?? [],
    nowMinutes,
  });

  const available = slots.filter((s) => s.available).map((s) => {
    const start = new Date(`${date}T${s.time}:00`);
    return { start_sec: Math.floor(start.getTime() / 1000), duration_sec: service.duration_minutes * 60 };
  });

  return NextResponse.json({ merchantId, serviceId, staffId, date, availability: available });
}
