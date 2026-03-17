import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendBookingConfirmationEmail, sendStaffNotificationEmail } from '@/lib/email';

const getLimiter = rateLimit({ prefix: 'reschedule-get', limit: 15, windowMs: 60_000 });
const postLimiter = rateLimit({ prefix: 'reschedule-post', limit: 5, windowMs: 60_000 });

const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

/**
 * GET /api/book/reschedule/[token]
 *
 * Public endpoint — returns appointment + booking data for the reschedule form.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  if (!getLimiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  const { token } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });
  }

  // Look up appointment
  const { data: appointment, error: aptErr } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, restaurant_id, date, start_time, end_time, status,
      client_name, client_email, client_phone, notes,
      staff_id, service_id,
      service:services(id, name, duration_minutes, price, category),
      staff:staff_members(id, name, avatar_url, service_ids)
    `)
    .eq('cancel_token', token)
    .single();

  if (aptErr || !appointment) {
    return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });
  }

  // Fetch restaurant info
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color, logo_url')
    .eq('id', appointment.restaurant_id)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }

  // Fetch settings, staff availability
  const [settingsRes, availabilityRes] = await Promise.all([
    supabaseAdmin
      .from('appointment_settings')
      .select('slot_duration_minutes, buffer_minutes, max_advance_days, min_advance_hours, working_days, opening_time, closing_time, allow_cancellation, cancellation_deadline_hours')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle(),
    supabaseAdmin
      .from('staff_availability')
      .select('staff_id, day_of_week, start_time, end_time, is_working')
      .eq('restaurant_id', restaurant.id)
      .eq('staff_id', appointment.staff_id),
  ]);

  const settings = settingsRes.data ?? {
    slot_duration_minutes: 15,
    buffer_minutes: 0,
    max_advance_days: 30,
    min_advance_hours: 2,
    working_days: [1, 2, 3, 4, 5, 6],
    opening_time: '09:00',
    closing_time: '19:00',
    allow_cancellation: true,
    cancellation_deadline_hours: 24,
  };

  return NextResponse.json({
    appointment: {
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      status: appointment.status,
      clientName: appointment.client_name,
      service: appointment.service,
      staff: appointment.staff,
    },
    business: {
      name: restaurant.name,
      slug: restaurant.slug,
      primaryColor: restaurant.primary_color,
      logoUrl: restaurant.logo_url,
    },
    availability: availabilityRes.data ?? [],
    settings: {
      slot_duration_minutes: settings.slot_duration_minutes,
      buffer_minutes: settings.buffer_minutes,
      max_advance_days: settings.max_advance_days,
      min_advance_hours: settings.min_advance_hours,
      working_days: settings.working_days,
      opening_time: settings.opening_time,
      closing_time: settings.closing_time,
    },
    policy: {
      allowCancellation: settings.allow_cancellation,
      cancellationDeadlineHours: settings.cancellation_deadline_hours,
    },
  });
}

/**
 * POST /api/book/reschedule/[token]
 *
 * Public endpoint — reschedules an appointment to a new date/time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  if (!postLimiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  const { token } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
  }

  const { date, time } = parsed.data;

  // Look up appointment
  const { data: appointment, error: aptErr } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, restaurant_id, date, start_time, status,
      staff_id, service_id, cancel_token,
      client_name, client_email, client_phone, notes,
      service:services(id, name, duration_minutes, price),
      staff:staff_members(id, name, email)
    `)
    .eq('cancel_token', token)
    .single();

  if (aptErr || !appointment) {
    return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });
  }

  if (appointment.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'Ce rendez-vous ne peut plus être modifié.' },
      { status: 400 },
    );
  }

  // Fetch settings for deadline check
  const { data: settings } = await supabaseAdmin
    .from('appointment_settings')
    .select('cancellation_deadline_hours, allow_cancellation')
    .eq('restaurant_id', appointment.restaurant_id)
    .maybeSingle();

  const cancellationDeadlineHours = settings?.cancellation_deadline_hours ?? 24;

  // Check deadline against the ORIGINAL appointment time
  const [oy, om, od] = appointment.date.split('-').map(Number);
  const [oh, omin] = appointment.start_time.split(':').map(Number);
  const originalTime = new Date(oy, om - 1, od, oh, omin);
  const deadlineMs = cancellationDeadlineHours * 60 * 60 * 1000;
  const now = new Date();

  if (originalTime.getTime() - now.getTime() < deadlineMs) {
    return NextResponse.json(
      { error: `Le délai de modification de ${cancellationDeadlineHours}h avant le rendez-vous est dépassé.` },
      { status: 400 },
    );
  }

  // Calculate new end time
  const service = appointment.service as unknown as { id: string; name: string; duration_minutes: number; price: number } | null;
  if (!service) {
    return NextResponse.json({ error: 'Service introuvable.' }, { status: 400 });
  }

  const [h, m] = time.split(':').map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + service.duration_minutes;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  // Check for conflicts (exclude current appointment)
  const { data: conflicts } = await supabaseAdmin
    .from('appointments')
    .select('id')
    .eq('staff_id', appointment.staff_id)
    .eq('restaurant_id', appointment.restaurant_id)
    .eq('date', date)
    .in('status', ['confirmed'])
    .neq('id', appointment.id)
    .lt('start_time', endTime)
    .gt('end_time', time);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: 'Ce créneau n\'est plus disponible. Veuillez en choisir un autre.' },
      { status: 409 },
    );
  }

  // Update appointment
  const { error: updateErr } = await supabaseAdmin
    .from('appointments')
    .update({
      date,
      start_time: time,
      end_time: endTime,
    })
    .eq('id', appointment.id);

  if (updateErr) {
    console.error('[reschedule] Update error:', updateErr);
    return NextResponse.json({ error: 'Erreur lors de la modification.' }, { status: 500 });
  }

  // Fetch restaurant for email
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('name, slug, primary_color')
    .eq('id', appointment.restaurant_id)
    .single();

  // Send updated confirmation email
  if (restaurant && appointment.client_email) {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rebites.be';
    const cancelUrl = `${APP_URL}/book/cancel/${appointment.cancel_token}`;
    const rescheduleUrl = `${APP_URL}/book/reschedule/${appointment.cancel_token}`;

    sendBookingConfirmationEmail({
      to: appointment.client_email,
      clientName: appointment.client_name,
      serviceName: service.name,
      staffName: (appointment.staff as unknown as { name: string })?.name ?? '',
      date,
      startTime: time,
      endTime,
      price: service.price,
      durationMinutes: service.duration_minutes,
      businessName: restaurant.name,
      businessColor: restaurant.primary_color ?? '#111827',
      businessSlug: restaurant.slug,
      cancelUrl,
      rescheduleUrl,
    }).catch((err) => console.error('[reschedule] Email send error:', err));

    // Send staff notification if staff has email
    const staff = appointment.staff as unknown as { id: string; name: string; email: string } | null;
    if (staff?.email) {
      sendStaffNotificationEmail({
        to: staff.email,
        staffName: staff.name,
        clientName: appointment.client_name,
        clientPhone: appointment.client_phone ?? '',
        clientEmail: appointment.client_email,
        serviceName: service.name,
        date,
        startTime: time,
        endTime,
        notes: appointment.notes,
        businessName: restaurant.name,
        businessColor: restaurant.primary_color ?? '#111827',
        isReschedule: true,
      }).catch((err) => console.error('[reschedule] Staff notification error:', err));
    }
  }

  return NextResponse.json({
    success: true,
    appointment: {
      date,
      startTime: time,
      endTime,
      serviceName: service.name,
      staffName: (appointment.staff as unknown as { name: string })?.name ?? '',
      durationMinutes: service.duration_minutes,
      price: service.price,
    },
  });
}
