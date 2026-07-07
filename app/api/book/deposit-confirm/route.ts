import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { refreshAppointmentOnPass } from '@/lib/booking-wallet';
import { sendBookingConfirmationEmail, sendStaffNotificationEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

const limiter = rateLimit({ prefix: 'deposit-confirm', limit: 20, windowMs: 60_000 });

const schema = z.object({
  appointmentId: z.string().uuid(),
  sessionId:     z.string().min(10).max(255),
});

/**
 * POST /api/book/deposit-confirm
 *
 * Appelé par la page de succès au retour du Checkout Stripe (acompte).
 * Vérifie le paiement AUPRÈS DE STRIPE (session récupérée sur le compte
 * connecté — le client ne peut rien falsifier), puis confirme le RDV et
 * envoie les emails. Idempotent : re-appeler sur un RDV déjà confirmé
 * renvoie simplement success.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
  }
  const { appointmentId, sessionId } = parsed.data;

  const { data: appointment } = await supabaseAdmin
    .from('appointments')
    .select('id, restaurant_id, status, stripe_checkout_session_id, client_name, client_email, client_phone, notes, date, start_time, end_time, service_id, staff_id, cancel_token')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });
  }

  // Idempotence : déjà confirmé → OK silencieux
  if (appointment.status === 'confirmed') {
    return NextResponse.json({ success: true, alreadyConfirmed: true });
  }
  if (appointment.status !== 'pending_payment' || appointment.stripe_checkout_session_id !== sessionId) {
    return NextResponse.json({ error: 'Paiement non vérifiable pour ce rendez-vous.' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color, stripe_account_id')
    .eq('id', appointment.restaurant_id)
    .single();

  if (!restaurant?.stripe_account_id) {
    return NextResponse.json({ error: 'Configuration de paiement introuvable.' }, { status: 500 });
  }

  // ── Vérité Stripe : la session est-elle réellement payée ? ──────────────
  let paid = false;
  try {
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { stripeAccount: restaurant.stripe_account_id },
    );
    paid = session.payment_status === 'paid';
  } catch (err) {
    logger.error({ ctx: 'deposit-confirm', rid: restaurant.id, msg: 'session retrieve failed', err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Vérification du paiement impossible.' }, { status: 502 });
  }

  if (!paid) {
    return NextResponse.json({ error: 'Le paiement n\'est pas finalisé.', paid: false }, { status: 402 });
  }

  // ── Confirmation ─────────────────────────────────────────────────────────
  await supabaseAdmin
    .from('appointments')
    .update({ status: 'confirmed' })
    .eq('id', appointment.id)
    .eq('status', 'pending_payment');

  // Emails (différés jusqu'au paiement) + carte Wallet
  const [{ data: service }, { data: staff }] = await Promise.all([
    supabaseAdmin.from('services').select('name, price, duration_minutes').eq('id', appointment.service_id).maybeSingle(),
    supabaseAdmin.from('staff_members').select('name, email').eq('id', appointment.staff_id).maybeSingle(),
  ]);

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rebites.be';
  const cancelUrl = appointment.cancel_token ? `${APP_URL}/book/cancel/${appointment.cancel_token}` : null;
  const rescheduleUrl = appointment.cancel_token ? `${APP_URL}/book/reschedule/${appointment.cancel_token}` : null;

  sendBookingConfirmationEmail({
    to: appointment.client_email,
    clientName: appointment.client_name,
    serviceName: service?.name ?? '',
    staffName: staff?.name ?? '',
    date: appointment.date,
    startTime: String(appointment.start_time).slice(0, 5),
    endTime: String(appointment.end_time).slice(0, 5),
    price: service?.price ?? 0,
    durationMinutes: service?.duration_minutes ?? 0,
    businessName: restaurant.name,
    businessColor: restaurant.primary_color ?? '#111827',
    businessSlug: restaurant.slug,
    confirmationMessage: null,
    cancelUrl,
    rescheduleUrl,
  }).catch((err) => logger.error({ ctx: 'deposit-confirm', rid: restaurant.id, msg: 'confirmation email failed', err }));

  if (staff?.email) {
    sendStaffNotificationEmail({
      to: staff.email,
      staffName: staff.name ?? '',
      clientName: appointment.client_name,
      clientPhone: appointment.client_phone,
      clientEmail: appointment.client_email,
      serviceName: service?.name ?? '',
      date: appointment.date,
      startTime: String(appointment.start_time).slice(0, 5),
      endTime: String(appointment.end_time).slice(0, 5),
      notes: appointment.notes ?? null,
      businessName: restaurant.name,
      businessColor: restaurant.primary_color ?? '#111827',
    }).catch((err) => logger.error({ ctx: 'deposit-confirm', rid: restaurant.id, msg: 'staff email failed', err }));
  }

  await refreshAppointmentOnPass(restaurant.id, appointment.client_email);

  return NextResponse.json({ success: true });
}
