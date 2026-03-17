import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendWaitlistNotifyEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

const getLimiter = rateLimit({ prefix: 'cancel-get', limit: 15, windowMs: 60_000 });
const postLimiter = rateLimit({ prefix: 'cancel-post', limit: 5, windowMs: 60_000 });

/**
 * GET /api/book/cancel/[token]
 *
 * Public endpoint — returns appointment details for the cancellation page.
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

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });
  }

  // Look up appointment by cancel_token
  const { data: appointment, error: aptErr } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, restaurant_id, date, start_time, end_time, status,
      client_name, client_email, client_phone, notes,
      service:services(id, name, duration_minutes, price),
      staff:staff_members(id, name)
    `)
    .eq('cancel_token', token)
    .single();

  if (aptErr || !appointment) {
    return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });
  }

  // Fetch appointment settings for the restaurant
  const { data: settings } = await supabaseAdmin
    .from('appointment_settings')
    .select('allow_cancellation, cancellation_deadline_hours')
    .eq('restaurant_id', appointment.restaurant_id)
    .maybeSingle();

  const allowCancellation = settings?.allow_cancellation ?? true;
  const cancellationDeadlineHours = settings?.cancellation_deadline_hours ?? 24;

  // Fetch restaurant info
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('name, slug, primary_color')
    .eq('id', appointment.restaurant_id)
    .single();

  return NextResponse.json({
    appointment: {
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      status: appointment.status,
      clientName: appointment.client_name,
      notes: appointment.notes,
      service: appointment.service,
      staff: appointment.staff,
    },
    business: restaurant ? {
      name: restaurant.name,
      slug: restaurant.slug,
      primaryColor: restaurant.primary_color,
    } : null,
    policy: {
      allowCancellation,
      cancellationDeadlineHours,
    },
  });
}

/**
 * POST /api/book/cancel/[token]
 *
 * Public endpoint — cancels an appointment.
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

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });
  }

  // Look up appointment
  const { data: appointment, error: aptErr } = await supabaseAdmin
    .from('appointments')
    .select('id, restaurant_id, date, start_time, status')
    .eq('cancel_token', token)
    .single();

  if (aptErr || !appointment) {
    return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });
  }

  // Validate status
  if (appointment.status === 'cancelled') {
    return NextResponse.json({ error: 'Ce rendez-vous a déjà été annulé.' }, { status: 400 });
  }

  if (appointment.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'Ce rendez-vous ne peut plus être annulé.' },
      { status: 400 },
    );
  }

  // Fetch settings
  const { data: settings } = await supabaseAdmin
    .from('appointment_settings')
    .select('allow_cancellation, cancellation_deadline_hours')
    .eq('restaurant_id', appointment.restaurant_id)
    .maybeSingle();

  const allowCancellation = settings?.allow_cancellation ?? true;
  const cancellationDeadlineHours = settings?.cancellation_deadline_hours ?? 24;

  if (!allowCancellation) {
    return NextResponse.json(
      { error: 'L\'annulation en ligne n\'est pas autorisée pour cet établissement. Veuillez les contacter directement.' },
      { status: 403 },
    );
  }

  // Check deadline
  const [y, m, d] = appointment.date.split('-').map(Number);
  const [h, min] = appointment.start_time.split(':').map(Number);
  const appointmentTime = new Date(y, m - 1, d, h, min);
  const deadlineMs = cancellationDeadlineHours * 60 * 60 * 1000;
  const now = new Date();

  if (appointmentTime.getTime() - now.getTime() < deadlineMs) {
    return NextResponse.json(
      { error: `Le délai d'annulation de ${cancellationDeadlineHours}h avant le rendez-vous est dépassé. Veuillez contacter l'établissement directement.` },
      { status: 400 },
    );
  }

  // Cancel the appointment
  const { error: updateErr } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointment.id);

  if (updateErr) {
    logger.error({ ctx: 'cancel', msg: 'Update error', err: updateErr.message });
    return NextResponse.json({ error: 'Erreur lors de l\'annulation.' }, { status: 500 });
  }

  // ── Notify waiting list entries for this date + service ────────────────
  try {
    // Fetch the cancelled appointment's service info
    const { data: fullAppt } = await supabaseAdmin
      .from('appointments')
      .select('service_id, staff_id')
      .eq('id', appointment.id)
      .single();

    if (fullAppt) {
      // Find matching waitlist entries
      const { data: waitlistEntries } = await supabaseAdmin
        .from('waiting_list')
        .select('id, client_name, client_email, service:services(name)')
        .eq('restaurant_id', appointment.restaurant_id)
        .eq('desired_date', appointment.date)
        .eq('status', 'waiting')
        .eq('service_id', fullAppt.service_id);

      if (waitlistEntries?.length) {
        // Fetch restaurant for email
        const { data: resto } = await supabaseAdmin
          .from('restaurants')
          .select('name, slug, primary_color')
          .eq('id', appointment.restaurant_id)
          .single();

        if (resto) {
          // Notify all matching entries (non-blocking)
          await Promise.allSettled(
            waitlistEntries.map(async (entry) => {
              // Mark as notified
              await supabaseAdmin
                .from('waiting_list')
                .update({
                  status: 'notified',
                  notified_at: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                })
                .eq('id', entry.id);

              // Send notification email
              const svc = entry.service as unknown as { name: string } | null;
              const serviceName = svc?.name ?? '';
              await sendWaitlistNotifyEmail({
                to: entry.client_email,
                clientName: entry.client_name,
                serviceName,
                date: appointment.date,
                businessName: resto.name,
                businessColor: resto.primary_color ?? '#FF6B35',
                businessSlug: resto.slug,
              });
            }),
          );
        }
      }
    }
  } catch (err) {
    // Non-blocking: waitlist notification failure shouldn't break the cancellation
    logger.error({ ctx: 'cancel', msg: 'Waitlist notification failed', err: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({ success: true });
}
