import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isBookingEligible } from '@/lib/booking-eligibility';
import { verifyRwgAuth, mapBookingStatus } from '@/lib/reserve-with-google';
import { sendBookingConfirmationEmail } from '@/lib/email';
import { refreshAppointmentOnPass } from '@/lib/booking-wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  merchantId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  clientName: z.string().trim().min(1).max(100),
  clientEmail: z.string().trim().email().max(255),
  clientPhone: z.string().trim().min(1).max(30),
});

/**
 * POST /api/rwg/v3/create-booking
 * Crée un RDV confirmé depuis Reserve with Google. Réservations RwG confirmées
 * directement (le flux acompte reste réservé à la page publique — voir runbook).
 * Anti-double-booking identique au flux public.
 */
export async function POST(request: Request) {
  if (!verifyRwgAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { merchantId, serviceId, staffId, date, time, clientName, clientEmail, clientPhone } = parsed.data;

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants').select('id, name, slug, business_type, primary_color').eq('id', merchantId).single();
  if (!restaurant || !isBookingEligible(restaurant.business_type)) {
    return NextResponse.json({ error: 'Merchant not bookable' }, { status: 404 });
  }

  const { data: service } = await supabaseAdmin
    .from('services').select('id, name, duration_minutes, price')
    .eq('id', serviceId).eq('restaurant_id', merchantId).eq('active', true).single();
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 400 });

  const { data: staff } = await supabaseAdmin
    .from('staff_members').select('id, name, email, service_ids')
    .eq('id', staffId).eq('restaurant_id', merchantId).eq('active', true).single();
  if (!staff || !staff.service_ids.includes(serviceId)) {
    return NextResponse.json({ error: 'Staff not available for service' }, { status: 400 });
  }

  const [h, m] = time.split(':').map(Number);
  const endMinutes = h * 60 + m + service.duration_minutes;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  // Anti-double-booking (confirmed + pending_payment bloquent).
  const { data: conflicts } = await supabaseAdmin
    .from('appointments').select('id')
    .eq('staff_id', staffId).eq('restaurant_id', merchantId).eq('date', date)
    .in('status', ['confirmed', 'pending_payment'])
    .lt('start_time', endTime).gt('end_time', time);
  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: 'Slot no longer available' }, { status: 409 });
  }

  const { data: appointment, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      restaurant_id: merchantId, staff_id: staffId, service_id: serviceId,
      date, start_time: time, end_time: endTime, status: 'confirmed',
      client_name: clientName, client_email: clientEmail, client_phone: clientPhone,
      notes: 'Reserve with Google',
    })
    .select('id, cancel_token, status')
    .single();

  if (error || !appointment) {
    console.error('[rwg/create-booking] insert error:', error);
    return NextResponse.json({ error: 'Booking failed' }, { status: 500 });
  }

  const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://rebites.be';
  sendBookingConfirmationEmail({
    to: clientEmail, clientName, serviceName: service.name, staffName: staff.name,
    date, startTime: time, endTime, price: service.price, durationMinutes: service.duration_minutes,
    businessName: restaurant.name, businessColor: restaurant.primary_color ?? '#111827', businessSlug: restaurant.slug,
    confirmationMessage: null,
    cancelUrl: appointment.cancel_token ? `${APP}/book/cancel/${appointment.cancel_token}` : null,
    rescheduleUrl: appointment.cancel_token ? `${APP}/book/reschedule/${appointment.cancel_token}` : null,
  }).catch((err) => console.error('[rwg/create-booking] email error:', err));

  await refreshAppointmentOnPass(merchantId, clientEmail);

  return NextResponse.json({
    bookingId: appointment.id,
    status: mapBookingStatus(appointment.status),
  });
}
