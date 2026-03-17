import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendFollowUpEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * GET /api/cron/followup
 *
 * Runs daily via Vercel Cron (e.g. 10 AM UTC).
 * Sends follow-up emails to clients whose appointment was completed yesterday.
 * Encourages re-booking.
 *
 * Idempotency: uses appointment_reminders table with type='followup' to prevent duplicates.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  if (!timingSafeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Yesterday
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = formatDate(yesterday);

  // Find completed appointments from yesterday
  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, restaurant_id, date, client_name, client_email,
      service:services(name),
      staff:staff_members(name)
    `)
    .eq('date', yesterdayStr)
    .eq('status', 'completed')
    .not('client_email', 'eq', '');

  if (error) {
    logger.error({ ctx: 'cron/followup', msg: 'Query failed', err: error.message });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!appointments?.length) {
    return NextResponse.json({ success: true, sent: 0, skipped: 0 });
  }

  // Filter out appointments that already got a followup
  const aptIds = appointments.map((a) => a.id);
  const { data: alreadySent } = await supabaseAdmin
    .from('appointment_reminders')
    .select('appointment_id')
    .in('appointment_id', aptIds)
    .eq('type', 'followup');

  const sentSet = new Set((alreadySent ?? []).map((r) => r.appointment_id));
  const toSend = appointments.filter((a) => !sentSet.has(a.id));

  // Fetch restaurant info for each unique restaurant
  const restaurantIds = [...new Set(toSend.map((a) => a.restaurant_id))];
  const { data: restaurants } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color')
    .in('id', restaurantIds);

  const restoMap = new Map((restaurants ?? []).map((r) => [r.id, r]));

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    toSend.map(async (apt) => {
      const resto = restoMap.get(apt.restaurant_id);
      if (!resto || !apt.client_email) return;

      const service = apt.service as unknown as { name: string } | null;
      const staff = apt.staff as unknown as { name: string } | null;

      try {
        await sendFollowUpEmail({
          to: apt.client_email,
          clientName: apt.client_name,
          serviceName: service?.name ?? '',
          staffName: staff?.name ?? '',
          businessName: resto.name,
          businessColor: resto.primary_color ?? '#FF6B35',
          businessSlug: resto.slug,
        });

        // Record followup to prevent duplicates
        await supabaseAdmin.from('appointment_reminders').insert({
          appointment_id: apt.id,
          restaurant_id: apt.restaurant_id,
          type: 'followup',
          sent_at: new Date().toISOString(),
          scheduled_for: new Date().toISOString(),
        });

        sent++;
      } catch (err) {
        logger.error({ ctx: 'cron/followup', msg: `Failed for apt ${apt.id}`, err: err instanceof Error ? err.message : String(err) });
        failed++;
      }
    }),
  );

  logger.info({ ctx: 'cron/followup', msg: `sent=${sent} failed=${failed} skipped=${sentSet.size}` });

  return NextResponse.json({ success: true, sent, failed, skipped: sentSet.size });
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
