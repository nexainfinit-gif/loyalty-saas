import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import { sendStaffNotificationEmail } from '@/lib/email';
import { syncAppointmentToCalendar, updateCalendarEvent } from '@/lib/google-calendar-sync';

const createSchema = z.object({
  service_id:   z.string().uuid(),
  staff_id:     z.string().uuid(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:   z.string().regex(/^\d{2}:\d{2}$/),
  client_name:  z.string().trim().min(1).max(100),
  client_email: z.string().trim().email().max(255).or(z.literal('')),
  client_phone: z.string().trim().max(30),
  notes:        z.string().max(500).optional().nullable(),
  recurrence_pattern:  z.enum(['none', 'weekly', 'biweekly', 'monthly']).optional().default('none'),
  recurrence_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const statusSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(['confirmed', 'completed', 'cancelled', 'no_show']),
});

/**
 * GET /api/appointments?date=YYYY-MM-DD
 * Returns appointments for a specific date (or today) with joined service + staff.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  // Allow fetching a range for week view
  const dateEnd = searchParams.get('dateEnd');

  let query = supabaseAdmin
    .from('appointments')
    .select('*, service:services(*), staff:staff_members(*)')
    .eq('restaurant_id', auth.restaurantId)
    .order('start_time');

  if (date && dateEnd) {
    query = query.gte('date', date).lte('date', dateEnd);
  } else if (date) {
    query = query.eq('date', date);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });

  return NextResponse.json({ appointments: data });
}

/**
 * POST /api/appointments — create appointment from dashboard
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  }

  const d = parsed.data;

  // Calculate end time from service duration
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('duration_minutes')
    .eq('id', d.service_id)
    .eq('restaurant_id', auth.restaurantId)
    .single();

  if (!service) return NextResponse.json({ error: 'Service introuvable.' }, { status: 400 });

  const [h, m] = d.start_time.split(':').map(Number);
  const endMin = h * 60 + m + service.duration_minutes;
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

  // Conflict check
  const { data: conflicts } = await supabaseAdmin
    .from('appointments')
    .select('id')
    .eq('staff_id', d.staff_id)
    .eq('restaurant_id', auth.restaurantId)
    .eq('date', d.date)
    .in('status', ['confirmed'])
    .lt('start_time', endTime)
    .gt('end_time', d.start_time);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: 'Ce créneau est déjà occupé.' }, { status: 409 });
  }

  const recurrencePattern = d.recurrence_pattern ?? 'none';
  const recurrenceEndDate = d.recurrence_end_date ?? null;

  // Generate all dates for the series
  const dates = generateRecurrenceDates(d.date, recurrencePattern, recurrenceEndDate);

  // Check conflicts for all dates
  const conflictDates: string[] = [];
  for (const dateStr of dates) {
    const { data: conflicts2 } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('staff_id', d.staff_id)
      .eq('restaurant_id', auth.restaurantId)
      .eq('date', dateStr)
      .in('status', ['confirmed'])
      .lt('start_time', endTime)
      .gt('end_time', d.start_time);

    if (conflicts2 && conflicts2.length > 0) {
      conflictDates.push(dateStr);
    }
  }

  // Filter out conflicting dates (skip, don't block entire series)
  const validDates = dates.filter((dd) => !conflictDates.includes(dd));

  if (validDates.length === 0) {
    return NextResponse.json({
      error: recurrencePattern === 'none'
        ? 'Ce créneau est déjà occupé.'
        : 'Tous les créneaux de la série sont déjà occupés.',
    }, { status: 409 });
  }

  // Insert the first appointment (parent)
  const { data: appointment, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      restaurant_id: auth.restaurantId,
      staff_id:      d.staff_id,
      service_id:    d.service_id,
      date:          validDates[0],
      start_time:    d.start_time,
      end_time:      endTime,
      status:        'confirmed',
      client_name:   d.client_name,
      client_email:  d.client_email || null,
      client_phone:  d.client_phone || null,
      notes:         d.notes ?? null,
      recurrence_pattern: recurrencePattern,
      recurrence_end_date: recurrenceEndDate,
    })
    .select('*, service:services(*), staff:staff_members(*)')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Erreur lors de la création.' }, { status: 500 });
  }

  // Insert remaining dates as children
  const childAppointments: typeof appointment[] = [];
  if (validDates.length > 1) {
    const childRows = validDates.slice(1).map((dateStr) => ({
      restaurant_id: auth.restaurantId,
      staff_id:      d.staff_id,
      service_id:    d.service_id,
      date:          dateStr,
      start_time:    d.start_time,
      end_time:      endTime,
      status:        'confirmed' as const,
      client_name:   d.client_name,
      client_email:  d.client_email || null,
      client_phone:  d.client_phone || null,
      notes:         d.notes ?? null,
      recurrence_pattern: recurrencePattern,
      recurrence_end_date: recurrenceEndDate,
      recurrence_parent_id: appointment.id,
    }));

    const { data: children } = await supabaseAdmin
      .from('appointments')
      .insert(childRows)
      .select('*, service:services(*), staff:staff_members(*)');

    if (children) childAppointments.push(...children);
  }

  // Google Calendar sync (fire-and-forget for all appointments in series)
  const allAptIds = [appointment.id, ...childAppointments.map((c) => c.id)];
  Promise.allSettled(
    allAptIds.map((aptId) => syncAppointmentToCalendar(aptId, auth.restaurantId))
  ).catch(() => {});

  // Send staff notification email (fire-and-forget)
  if (d.staff_id) {
    const { data: staffMember } = await supabaseAdmin
      .from('staff_members')
      .select('name, email')
      .eq('id', d.staff_id)
      .eq('restaurant_id', auth.restaurantId)
      .single();

    if (staffMember?.email) {
      const { data: restaurant } = await supabaseAdmin
        .from('restaurants')
        .select('name, primary_color')
        .eq('id', auth.restaurantId)
        .single();

      if (restaurant) {
        sendStaffNotificationEmail({
          to: staffMember.email,
          staffName: staffMember.name,
          clientName: d.client_name,
          clientPhone: d.client_phone || '',
          clientEmail: d.client_email || '',
          serviceName: (appointment as { service?: { name: string } }).service?.name ?? '',
          date: d.date,
          startTime: d.start_time,
          endTime,
          notes: d.notes ?? null,
          businessName: restaurant.name,
          businessColor: restaurant.primary_color ?? '#111827',
        }).catch((err) => console.error('[appointments] Staff notification error:', err));
      }
    }
  }

  return NextResponse.json({
    appointment,
    seriesCount: validDates.length,
    skippedDates: conflictDates,
  }, { status: 201 });
}

/**
 * PUT /api/appointments — update appointment status
 *
 * When marking as no_show: increments client_no_show_stats counter.
 * When reverting from no_show: decrements the counter.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  }

  // Fetch current appointment to detect status transitions
  const { data: current } = await supabaseAdmin
    .from('appointments')
    .select('status, client_email')
    .eq('id', parsed.data.id)
    .eq('restaurant_id', auth.restaurantId)
    .single();

  if (!current) return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });

  const newStatus = parsed.data.status;
  const oldStatus = current.status;

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update({ status: newStatus })
    .eq('id', parsed.data.id)
    .eq('restaurant_id', auth.restaurantId)
    .select('*, service:services(*), staff:staff_members(*)')
    .single();

  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 });

  // Google Calendar sync (fire-and-forget)
  updateCalendarEvent(parsed.data.id, auth.restaurantId, newStatus).catch(() => {});

  // Track no-show stats (increment or decrement based on status transition)
  if (current.client_email) {
    const email = current.client_email.toLowerCase().trim();

    if (newStatus === 'no_show' && oldStatus !== 'no_show') {
      // Increment no-show counter
      await supabaseAdmin.rpc('increment_no_show', {
        p_restaurant_id: auth.restaurantId,
        p_client_email: email,
      }).then(null, (err) => {
        // Fallback: upsert manually if RPC doesn't exist yet
        console.error('[appointments] RPC increment_no_show failed, using fallback:', err);
        return supabaseAdmin
          .from('client_no_show_stats')
          .upsert(
            {
              restaurant_id: auth.restaurantId,
              client_email: email,
              no_show_count: 1,
              last_no_show_at: new Date().toISOString(),
            },
            { onConflict: 'restaurant_id,client_email' }
          );
      });
    } else if (oldStatus === 'no_show' && newStatus !== 'no_show') {
      // Decrement no-show counter (revert)
      const { data: stats } = await supabaseAdmin
        .from('client_no_show_stats')
        .select('no_show_count')
        .eq('restaurant_id', auth.restaurantId)
        .eq('client_email', email)
        .single();

      if (stats && stats.no_show_count > 0) {
        await supabaseAdmin
          .from('client_no_show_stats')
          .update({ no_show_count: stats.no_show_count - 1 })
          .eq('restaurant_id', auth.restaurantId)
          .eq('client_email', email);
      }
    }
  }

  // ── Loyalty points on completion ────────────────────────────────────────
  let loyaltyAwarded = 0;

  if (newStatus === 'completed' && oldStatus !== 'completed' && current.client_email) {
    try {
      // 1. Fetch appointment settings
      const { data: aptSettings } = await supabaseAdmin
        .from('appointment_settings')
        .select('auto_loyalty_points, loyalty_points_per_visit')
        .eq('restaurant_id', auth.restaurantId)
        .maybeSingle();

      if (aptSettings?.auto_loyalty_points) {
        const pointsDelta = aptSettings.loyalty_points_per_visit || 0;

        if (pointsDelta > 0) {
          // 2. Match customer by email
          const { data: customer } = await supabaseAdmin
            .from('customers')
            .select('id, total_points, total_visits, stamps_count')
            .eq('restaurant_id', auth.restaurantId)
            .eq('email', current.client_email.toLowerCase().trim())
            .maybeSingle();

          if (customer) {
            // 3. Prevent double-award: check for existing transaction with this appointment_id
            const { data: existingTx } = await supabaseAdmin
              .from('transactions')
              .select('id')
              .eq('customer_id', customer.id)
              .eq('type', 'appointment')
              .contains('metadata', { appointment_id: parsed.data.id })
              .maybeSingle();

            if (!existingTx) {
              // 4. Fetch loyalty_settings for program_type
              const { data: loyaltySettings } = await supabaseAdmin
                .from('loyalty_settings')
                .select('program_type, stamps_total')
                .eq('restaurant_id', auth.restaurantId)
                .maybeSingle();

              const programType = loyaltySettings?.program_type ?? 'points';
              const stampsTotal = loyaltySettings?.stamps_total ?? 10;

              // 5. Insert transaction
              await supabaseAdmin.from('transactions').insert({
                customer_id: customer.id,
                restaurant_id: auth.restaurantId,
                type: 'appointment',
                points_delta: pointsDelta,
                metadata: { appointment_id: parsed.data.id, source: 'auto_appointment_completion' },
              });

              // 6. Update customer stats
              await supabaseAdmin.from('customers').update({
                total_points: customer.total_points + pointsDelta,
                total_visits: customer.total_visits + 1,
                stamps_count: programType === 'stamps'
                  ? (customer.stamps_count + 1) % stampsTotal
                  : customer.stamps_count,
                last_visit_at: new Date().toISOString(),
              }).eq('id', customer.id);

              loyaltyAwarded = pointsDelta;
            }
          }
        }
      }
    } catch (err) {
      // Non-critical: log and continue — the status change already succeeded
      console.error('[appointments] Loyalty award error:', err);
    }
  }

  return NextResponse.json({ appointment: data, loyaltyAwarded });
}

/**
 * DELETE /api/appointments — cancel a series or single appointment
 * Body: { id: string, cancelSeries?: boolean }
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();
  const id = body.id;
  const cancelSeries = body.cancelSeries === true;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'ID requis.' }, { status: 400 });
  }

  if (cancelSeries) {
    // Cancel all future confirmed appointments in this series
    const today = new Date().toISOString().split('T')[0];

    // Cancel children
    await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('recurrence_parent_id', id)
      .eq('restaurant_id', auth.restaurantId)
      .eq('status', 'confirmed')
      .gte('date', today);

    // Cancel parent too
    await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('restaurant_id', auth.restaurantId)
      .eq('status', 'confirmed')
      .gte('date', today);

    // Also check if this appointment IS a child — cancel siblings
    const { data: apt } = await supabaseAdmin
      .from('appointments')
      .select('recurrence_parent_id')
      .eq('id', id)
      .single();

    if (apt?.recurrence_parent_id) {
      await supabaseAdmin
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('recurrence_parent_id', apt.recurrence_parent_id)
        .eq('restaurant_id', auth.restaurantId)
        .eq('status', 'confirmed')
        .gte('date', today);

      await supabaseAdmin
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', apt.recurrence_parent_id)
        .eq('restaurant_id', auth.restaurantId)
        .eq('status', 'confirmed')
        .gte('date', today);
    }

    return NextResponse.json({ success: true, cancelledSeries: true });
  }

  // Single cancellation
  const { error } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('restaurant_id', auth.restaurantId)
    .eq('status', 'confirmed');

  if (error) return NextResponse.json({ error: 'Erreur.' }, { status: 500 });

  return NextResponse.json({ success: true });
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Generate all dates for a recurring series.
 * Max 52 occurrences (1 year of weekly).
 */
function generateRecurrenceDates(
  startDate: string,
  pattern: string,
  endDate: string | null,
): string[] {
  if (pattern === 'none') return [startDate];

  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate
    ? new Date(endDate + 'T23:59:59')
    : new Date(start.getTime() + 365 * 86400000); // Default: 1 year max
  const MAX_OCCURRENCES = 52;

  let current = new Date(start);
  while (current <= end && dates.length < MAX_OCCURRENCES) {
    dates.push(formatDateStr(current));

    switch (pattern) {
      case 'weekly':
        current.setDate(current.getDate() + 7);
        break;
      case 'biweekly':
        current.setDate(current.getDate() + 14);
        break;
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        break;
      default:
        return dates;
    }
  }

  return dates;
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
