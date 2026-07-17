import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isBookingOpen } from '@/lib/booking-eligibility';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendBookingConfirmationEmail, sendStaffNotificationEmail } from '@/lib/email';
import { refreshAppointmentOnPass } from '@/lib/booking-wallet';
import { stripe } from '@/lib/stripe';
import { computeDepositCents } from '@/lib/stripe-connect';

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

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
    .select('id, name, slug, business_type, primary_color, booking_active')
    .eq('slug', slug)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }
  // Réservation ouverte aux établissements ayant l'add-on Booking actif
  // (payé ou salon grand-fathered), quel que soit le type d'activité. Gate serveur.
  if (!isBookingOpen(restaurant)) {
    return NextResponse.json({ error: "La réservation en ligne n'est pas disponible pour cet établissement." }, { status: 404 });
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
    .select('id, name, email, service_ids')
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

  // 5a. Libère les créneaux dont l'acompte n'a pas été payé sous 30 min
  const pendingExpiry = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'pending_payment')
    .lt('created_at', pendingExpiry);

  // 5b. Check for conflicts (double-booking prevention).
  // pending_payment bloque aussi le créneau (paiement d'acompte en cours).
  const { data: conflicts } = await supabaseAdmin
    .from('appointments')
    .select('id')
    .eq('staff_id', staffId)
    .eq('restaurant_id', restaurant.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending_payment'])
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
    .maybeSingle();

  const noShowCount = noShowStats?.no_show_count ?? 0;

  // Fetch no-show blocking threshold from appointment settings
  const { data: aptBlockSettings } = await supabaseAdmin
    .from('appointment_settings')
    .select('no_show_block_threshold')
    .eq('restaurant_id', restaurant.id)
    .maybeSingle();

  const blockThreshold = aptBlockSettings?.no_show_block_threshold ?? 3;

  if (blockThreshold > 0 && noShowCount >= blockThreshold) {
    return NextResponse.json(
      {
        error: 'Votre compte a trop de rendez-vous manqués. Veuillez contacter directement l\'établissement.',
        blocked: true,
      },
      { status: 403 },
    );
  }

  // 6b. Acompte requis ? Colonnes de la migration 039 lues en best-effort :
  // si la migration n'est pas encore appliquée, ces selects échouent
  // silencieusement et la réservation suit le flux normal sans acompte.
  let depositSettings: { deposit_enabled?: boolean; deposit_type?: string; deposit_value?: number } = {};
  let stripeInfo: { stripe_account_id?: string | null; stripe_charges_enabled?: boolean } = {};
  {
    const [{ data: ds }, { data: si }] = await Promise.all([
      supabaseAdmin.from('appointment_settings')
        .select('deposit_enabled, deposit_type, deposit_value')
        .eq('restaurant_id', restaurant.id).maybeSingle(),
      supabaseAdmin.from('restaurants')
        .select('stripe_account_id, stripe_charges_enabled')
        .eq('id', restaurant.id).maybeSingle(),
    ]);
    if (ds) depositSettings = ds;
    if (si) stripeInfo = si;
  }

  const depositCents = computeDepositCents(depositSettings, Number(service.price ?? 0));
  const requiresDeposit =
    depositCents !== null &&
    !!stripeInfo.stripe_account_id &&
    stripeInfo.stripe_charges_enabled === true;

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
      status:        requiresDeposit ? 'pending_payment' : 'confirmed',
      client_name:   clientName,
      client_email:  clientEmail,
      client_phone:  clientPhone,
      notes:         notes ?? null,
      ...(requiresDeposit ? { deposit_amount: depositCents! / 100 } : {}),
    })
    .select('id, cancel_token')
    .single();

  if (insertErr || !appointment) {
    console.error('[book] Insert error:', insertErr);
    return NextResponse.json({ error: 'Erreur lors de la création du rendez-vous.' }, { status: 500 });
  }

  // 7b. Acompte : Checkout Stripe SUR LE COMPTE DU COMMERÇANT (Connect).
  // Le RDV reste pending_payment (créneau bloqué 30 min max) ; il sera
  // confirmé au retour de paiement (/api/book/deposit-confirm) — les emails
  // partent à ce moment-là seulement.
  if (requiresDeposit) {
    try {
      const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const successParams = new URLSearchParams({
        service: service.name,
        date, start: time, end: endTime,
        business: restaurant.name,
        apt: appointment.id,
      });
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'eur',
              product_data: { name: `Acompte — ${service.name} (${restaurant.name})` },
              unit_amount: depositCents!,
            },
            quantity: 1,
          }],
          customer_email: clientEmail,
          metadata: { appointment_id: appointment.id, restaurant_id: restaurant.id, kind: 'booking_deposit' },
          success_url: `${APP}/fr/book/${restaurant.slug}/success?${successParams.toString()}&deposit_session={CHECKOUT_SESSION_ID}`,
          cancel_url:  `${APP}/fr/book/${restaurant.slug}?payment=cancelled`,
          expires_at:  Math.floor(Date.now() / 1000) + 30 * 60,
        },
        { stripeAccount: stripeInfo.stripe_account_id! },
      );

      await supabaseAdmin
        .from('appointments')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', appointment.id);

      return NextResponse.json({
        success: true,
        requiresPayment: true,
        paymentUrl: session.url,
        appointmentId: appointment.id,
        depositAmount: depositCents! / 100,
        serviceName: service.name,
      });
    } catch (err) {
      // Échec Stripe → on ne bloque pas la réservation : bascule sans acompte.
      console.error('[book] Deposit checkout failed, falling back to no-deposit:', err);
      await supabaseAdmin
        .from('appointments')
        .update({ status: 'confirmed', deposit_amount: null })
        .eq('id', appointment.id);
    }
  }

  // 7. Fetch confirmation message from settings
  const { data: appSettings } = await supabaseAdmin
    .from('appointment_settings')
    .select('confirmation_message')
    .eq('restaurant_id', restaurant.id)
    .single();

  const confirmationMessage = appSettings?.confirmation_message ?? null;

  // 8. Construct cancel/reschedule URLs
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rebites.be';
  const cancelUrl = appointment.cancel_token ? `${APP_URL}/book/cancel/${appointment.cancel_token}` : null;
  const rescheduleUrl = appointment.cancel_token ? `${APP_URL}/book/reschedule/${appointment.cancel_token}` : null;

  // 9. Send confirmation email (fire-and-forget — don't block the response)
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
    cancelUrl,
    rescheduleUrl,
  }).catch((err) => console.error('[book] Email send error:', err));

  // 10. Send staff notification (fire-and-forget)
  if (staff.email) {
    sendStaffNotificationEmail({
      to: staff.email,
      staffName: staff.name,
      clientName,
      clientPhone,
      clientEmail,
      serviceName: service.name,
      date,
      startTime: time,
      endTime,
      notes: notes ?? null,
      businessName: restaurant.name,
      businessColor: restaurant.primary_color ?? '#111827',
    }).catch((err) => console.error('[book] Staff notification error:', err));
  }

  // Synchronise le prochain RDV sur la carte Wallet du client (rappel gratuit)
  await refreshAppointmentOnPass(restaurant.id, clientEmail);

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
