import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

const staffSchema = z.object({
  name:        z.string().trim().min(1).max(100),
  email:       z.string().trim().email().max(255).optional().nullable(),
  phone:       z.string().trim().max(30).optional().nullable(),
  service_ids: z.array(z.string().uuid()).optional().default([]),
  active:      z.boolean().optional().default(true),
});

const availabilitySchema = z.object({
  staffId: z.string().uuid(),
  schedule: z.array(z.object({
    day_of_week: z.number().int().min(0).max(6),
    start_time:  z.string().regex(/^\d{2}:\d{2}$/),
    end_time:    z.string().regex(/^\d{2}:\d{2}$/),
    is_working:  z.boolean(),
  })),
});

/** GET /api/appointments/staff — list all staff + their availability */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const [staffRes, availRes] = await Promise.all([
    supabaseAdmin
      .from('staff_members')
      .select('*')
      .eq('restaurant_id', auth.restaurantId)
      .order('name'),
    supabaseAdmin
      .from('staff_availability')
      .select('*')
      .eq('restaurant_id', auth.restaurantId),
  ]);

  if (staffRes.error) return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });

  // Group availability by staff_id
  const availByStaff: Record<string, typeof availRes.data> = {};
  for (const row of availRes.data ?? []) {
    if (!availByStaff[row.staff_id]) availByStaff[row.staff_id] = [];
    availByStaff[row.staff_id].push(row);
  }

  return NextResponse.json({
    staff: staffRes.data,
    availability: availByStaff,
  });
}

/** POST /api/appointments/staff — create a new staff member */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();
  const parsed = staffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .insert({ restaurant_id: auth.restaurantId, ...parsed.data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Erreur lors de la création.' }, { status: 500 });
  return NextResponse.json({ staff: data }, { status: 201 });
}

/** PUT /api/appointments/staff — update staff member OR save availability schedule */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();

  // If body contains 'schedule', this is an availability update
  if (body.schedule) {
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
    }

    const { staffId, schedule } = parsed.data;

    // Delete existing availability for this staff member, then re-insert
    await supabaseAdmin
      .from('staff_availability')
      .delete()
      .eq('staff_id', staffId)
      .eq('restaurant_id', auth.restaurantId);

    if (schedule.length > 0) {
      const rows = schedule.map((s) => ({
        staff_id: staffId,
        restaurant_id: auth.restaurantId,
        ...s,
      }));

      const { error } = await supabaseAdmin
        .from('staff_availability')
        .insert(rows);

      if (error) return NextResponse.json({ error: 'Erreur lors de la sauvegarde des horaires.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // Otherwise, update staff member fields
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'ID manquant.' }, { status: 400 });

  const parsed = staffSchema.partial().safeParse(rest);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .update(parsed.data)
    .eq('id', id)
    .eq('restaurant_id', auth.restaurantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 });
  return NextResponse.json({ staff: data });
}

/** DELETE /api/appointments/staff — delete a staff member */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID manquant.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('staff_members')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', auth.restaurantId);

  if (error) return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
