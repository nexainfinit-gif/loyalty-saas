import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendBookingConfirmationEmail } from '@/lib/email';

const limiter = rateLimit({ prefix: 'book-create', limit: 5, windowMs: 60_000 });

const bookingSchema = z.object({
  serviceId:   z.string().uuid(),
  staffId:     z.string().uuid(),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time:        z.string().regex(/^\d{2}:\d{2}$/),
  clientName:  z.string().trim().min(1).max(100),
  clientEmail: z.string().trim().email().max(255),
  clientPhone: z.string().trim().min(1).max(30),
  notes:       z.string().max(500).optional().nullable(),
});

/**
 * POST /api/book/[slug]/book
 *
 * Public endpoint — creates an appointment.
 * Validates:
 *   - Restaurant exists
 *   - Service exists and is active
 *   - Staff exists, is active, and offers the service
 *   - Time slot is still available (no double-booking)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  const { slug } = await params;
  const body = await request.json();

  // Validate input
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(', ');
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { serviceId, staffId, date, time, clientName, clientEmail, clientPhone, notes } = parsed.data;

  // 1. Resolve restaurant
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color')
    .eq('slug', slug)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }

  // 2. Validate service
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id, name, duration_minutes, price')
    .eq('id', serviceId)
    .eq('restaurant_id', restaurant.id)
    .eq('active', true)
    .single();

  if (!service) {
    return NextResponse.json({ error: 'Service introuvable ou inactif.' }, { status: 400 });
  }

  // 3. Validate staff
  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, service_ids')
    .eq('id', staffId)
    .eq('restaurant_id', restaurant.id)
    .eq('active', true)
    .single();

  if (!staff) {
    return NextResponse.json({ error: 'Membre de l\'équipe introuvable.' }, { status: 400 });
  }

  if (!staff.service_ids.includes(serviceId)) {
    return NextResponse.json(
      { error: 'Ce membre de l\'équipe ne propose pas ce service.' },
      { status: 400 },
    );
  }

  // 4. Calculate end time
  const [h, m] = time.split(':').map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + service.duration_minutes;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  // 5. Check for conflicts (double-booking prevention)
  const { data: conflicts } = await supabaseAdmin
    .from('appointments')
    .select('id')
    .eq('staff_id', staffId)
    .eq('restaurant_id', restaurant.id)
    .eq('date', date)
    .in('status', ['confirmed'])
    .lt('start_time', endTime)
    .gt('end_time', time);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: 'Ce créneau n\'est plus disponible. Veuillez en choisir un autre.' },
      { status: 409 },
    );
  }

  // 6. Check client no-show history
  const { data: noShowStats } = await supabaseAdmin
    .from('client_no_show_stats')
    .select('no_show_count')
    .eq('restaurant_id', restaurant.id)
    .eq('client_email', clientEmail.toLowerCase().trim())
    .single();

  const noShowCount = noShowStats?.no_show_count ?? 0;

  // Future rule: block clients with excessive no-shows
  // Uncomment when deposit system is ready:
  // if (noShowCount >= 3) {
  //   return NextResponse.json(
  //     { error: 'Veuillez contacter l\'établissement pour réserver.', requiresDeposit: true },
  //     { status: 403 },
  //   );
  // }

  // 7. Create appointment
  const { data: appointment, error: insertErr } = await supabaseAdmin
    .from('appointments')
    .insert({
      restaurant_id: restaurant.id,
      staff_id:      staffId,
      service_id:    serviceId,
      date,
      start_time:    time,
      end_time:      endTime,
      status:        'confirmed',
      client_name:   clientName,
      client_email:  clientEmail,
      client_phone:  clientPhone,
      notes:         notes ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !appointment) {
    console.error('[book] Insert error:', insertErr);
    return NextResponse.json({ error: 'Erreur lors de la création du rendez-vous.' }, { status: 500 });
  }

  // 7. Fetch confirmation message from settings
  const { data: appSettings } = await supabaseAdmin
    .from('appointment_settings')
    .select('confirmation_message')
    .eq('restaurant_id', restaurant.id)
    .single();

  const confirmationMessage = appSettings?.confirmation_message ?? null;

  // 8. Send confirmation email (fire-and-forget — don't block the response)
  sendBookingConfirmationEmail({
    to: clientEmail,
    clientName,
    serviceName: service.name,
    staffName: staff.name,
    date,
    startTime: time,
    endTime,
    price: service.price,
    durationMinutes: service.duration_minutes,
    businessName: restaurant.name,
    businessColor: restaurant.primary_color ?? '#111827',
    businessSlug: restaurant.slug,
    confirmationMessage,
  }).catch((err) => console.error('[book] Email send error:', err));

  return NextResponse.json({
    success: true,
    appointmentId: appointment.id,
    serviceName: service.name,
    staffName: staff.name,
    date,
    startTime: time,
    endTime,
    price: service.price,
    durationMinutes: service.duration_minutes,
    businessName: restaurant.name,
    confirmationMessage,
    noShowCount,
  });
}
