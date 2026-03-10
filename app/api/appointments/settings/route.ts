import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

const settingsSchema = z.object({
  slot_duration_minutes:       z.number().int().min(5).max(120),
  buffer_minutes:              z.number().int().min(0).max(60),
  max_advance_days:            z.number().int().min(1).max(365),
  min_advance_hours:           z.number().int().min(0).max(168),
  allow_cancellation:          z.boolean(),
  cancellation_deadline_hours: z.number().int().min(0).max(168),
  confirmation_message:        z.string().max(500).optional().nullable(),
  reminder_hours_before:       z.number().int().min(1).max(168),
  auto_loyalty_points:         z.boolean(),
  loyalty_points_per_visit:    z.number().int().min(0).max(1000),
  working_days:                z.array(z.number().int().min(0).max(6)),
  opening_time:                z.string().regex(/^\d{2}:\d{2}$/),
  closing_time:                z.string().regex(/^\d{2}:\d{2}$/),
});

/** GET /api/appointments/settings */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { data } = await supabaseAdmin
    .from('appointment_settings')
    .select('*')
    .eq('restaurant_id', auth.restaurantId)
    .maybeSingle();

  // Return defaults if no settings row exists yet
  const settings = data ?? {
    id: null,
    restaurant_id: auth.restaurantId,
    slot_duration_minutes: 15,
    buffer_minutes: 0,
    max_advance_days: 30,
    min_advance_hours: 2,
    allow_cancellation: true,
    cancellation_deadline_hours: 24,
    confirmation_message: null,
    reminder_hours_before: 24,
    auto_loyalty_points: false,
    loyalty_points_per_visit: 10,
    working_days: [1, 2, 3, 4, 5, 6],
    opening_time: '09:00',
    closing_time: '19:00',
  };

  return NextResponse.json({ settings });
}

/** PUT /api/appointments/settings — upsert settings */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('appointment_settings')
    .upsert(
      { restaurant_id: auth.restaurantId, ...parsed.data },
      { onConflict: 'restaurant_id' },
    )
    .select()
    .single();

  if (error) {
    console.error('[settings] Upsert error:', error);
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde.' }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
