import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

const createSchema = z.object({
  service_id:   z.string().uuid(),
  staff_id:     z.string().uuid(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:   z.string().regex(/^\d{2}:\d{2}$/),
  client_name:  z.string().trim().min(1).max(100),
  client_email: z.string().trim().email().max(255).or(z.literal('')),
  client_phone: z.string().trim().max(30),
  notes:        z.string().max(500).optional().nullable(),
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

  const { data: appointment, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      restaurant_id: auth.restaurantId,
      staff_id:      d.staff_id,
      service_id:    d.service_id,
      date:          d.date,
      start_time:    d.start_time,
      end_time:      endTime,
      status:        'confirmed',
      client_name:   d.client_name,
      client_email:  d.client_email || null,
      client_phone:  d.client_phone || null,
      notes:         d.notes ?? null,
    })
    .select('*, service:services(*), staff:staff_members(*)')
    .single();

  if (error) {
    console.error('[appointments] Insert error:', error);
    return NextResponse.json({ error: 'Erreur lors de la création.' }, { status: 500 });
  }

  return NextResponse.json({ appointment }, { status: 201 });
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

  return NextResponse.json({ appointment: data });
}
