import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderEmail } from '@/lib/email';

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * GET /api/cron/reminders
 *
 * Runs every hour via Vercel Cron.
 * Sends appointment reminders:
 *   - 24h before (if not already sent)
 *   - 2h before (if not already sent)
 *
 * Architecture:
 *   1. Find confirmed appointments in the next 24h window
 *   2. Check appointment_reminders table to avoid duplicates
 *   3. Send emails and record the reminder
 *   4. Prepared for future SMS integration via the `type` column
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
  const results = { sent24h: 0, sent2h: 0, failed: 0 };

  // Window: appointments between now and now+25h (covers both 24h and 2h reminders)
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Build date/time strings for query
  const todayStr = formatDate(now);
  const tomorrowStr = formatDate(windowEnd);

  // Fetch confirmed appointments in the time window with their service and staff details
  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, restaurant_id, date, start_time, end_time, status,
      client_name, client_email,
      service:services(name, duration_minutes),
      staff:staff_members(name)
    `)
    .eq('status', 'confirmed')
    .gte('date', todayStr)
    .lte('date', tomorrowStr)
    .not('client_email', 'is', null);

  if (error || !appointments) {
    console.error('[cron/reminders] DB error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // Filter to appointments actually in the window
  const eligible = appointments.filter((apt) => {
    const aptTime = parseAppointmentTime(apt.date, apt.start_time);
    const hoursUntil = (aptTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    // Only send reminders for future appointments within window
    return hoursUntil > 0 && hoursUntil <= 25;
  });

  if (eligible.length === 0) {
    return NextResponse.json({ success: true, ...results, message: 'No reminders to send' });
  }

  // Fetch already-sent reminders for these appointments
  const aptIds = eligible.map((a) => a.id);
  const { data: existingReminders } = await supabaseAdmin
    .from('appointment_reminders')
    .select('appointment_id, scheduled_for')
    .in('appointment_id', aptIds)
    .eq('type', 'email')
    .not('sent_at', 'is', null);

  const sentSet = new Set(
    (existingReminders ?? []).map((r) => `${r.appointment_id}_${r.scheduled_for}`)
  );

  // Fetch restaurant details for email templates
  const restaurantIds = [...new Set(eligible.map((a) => a.restaurant_id))];
  const { data: restaurants } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color')
    .in('id', restaurantIds);

  const restaurantMap = new Map(
    (restaurants ?? []).map((r) => [r.id, r])
  );

  // Process each appointment
  const emailPromises: Promise<void>[] = [];

  for (const apt of eligible) {
    const aptTime = parseAppointmentTime(apt.date, apt.start_time);
    const hoursUntil = (aptTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const restaurant = restaurantMap.get(apt.restaurant_id);
    if (!restaurant || !apt.client_email) continue;

    const service = apt.service as unknown as { name: string; duration_minutes: number } | null;
    const staff = apt.staff as unknown as { name: string } | null;
    if (!service || !staff) continue;

    // Determine which reminders to send
    const remindersToSend: { hoursLabel: number; scheduledFor: string }[] = [];

    // 24h reminder: send when appointment is 23-25h away
    if (hoursUntil > 1 && hoursUntil <= 25) {
      const key24 = `${apt.id}_24h`;
      if (!sentSet.has(key24)) {
        remindersToSend.push({ hoursLabel: 24, scheduledFor: '24h' });
      }
    }

    // 2h reminder: send when appointment is 1-3h away
    if (hoursUntil > 0 && hoursUntil <= 3) {
      const key2 = `${apt.id}_2h`;
      if (!sentSet.has(key2)) {
        remindersToSend.push({ hoursLabel: 2, scheduledFor: '2h' });
      }
    }

    for (const reminder of remindersToSend) {
      const promise = sendReminderEmail({
        to: apt.client_email,
        clientName: apt.client_name,
        serviceName: service.name,
        staffName: staff.name,
        date: apt.date,
        startTime: apt.start_time,
        endTime: apt.end_time,
        durationMinutes: service.duration_minutes,
        businessName: restaurant.name,
        businessColor: restaurant.primary_color ?? '#111827',
        businessSlug: restaurant.slug,
        hoursUntil: reminder.hoursLabel,
      })
        .then(async () => {
          // Record the sent reminder
          await supabaseAdmin.from('appointment_reminders').insert({
            appointment_id: apt.id,
            restaurant_id: apt.restaurant_id,
            type: 'email',
            sent_at: new Date().toISOString(),
            scheduled_for: reminder.scheduledFor,
          });
          if (reminder.hoursLabel === 24) results.sent24h++;
          else results.sent2h++;
        })
        .catch((err) => {
          console.error(`[cron/reminders] Failed for apt ${apt.id}:`, err);
          results.failed++;
        });

      emailPromises.push(promise);
    }
  }

  await Promise.allSettled(emailPromises);

  console.log(`[cron/reminders] sent24h=${results.sent24h} sent2h=${results.sent2h} failed=${results.failed}`);

  return NextResponse.json({ success: true, ...results });
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseAppointmentTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}
