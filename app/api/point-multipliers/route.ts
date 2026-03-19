import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('point_multipliers')
    .select('*')
    .eq('restaurant_id', ctx.restaurantId)
    .order('day_of_week', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ multipliers: data ?? [], days: DAYS });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, multiplier, day_of_week, start_time, end_time } = body as {
    name?: string; multiplier?: number; day_of_week?: number; start_time?: string; end_time?: string;
  };
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('point_multipliers')
    .insert({
      restaurant_id: ctx.restaurantId,
      name,
      multiplier: multiplier ?? 2,
      day_of_week: day_of_week ?? null,
      start_time: start_time ?? null,
      end_time: end_time ?? null,
    })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ multiplier: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { id, ...updates } = body as { id?: string; [key: string]: unknown };
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const allowed = ['name', 'multiplier', 'day_of_week', 'start_time', 'end_time', 'active'];
  const safe: Record<string, unknown> = {};
  for (const k of allowed) { if (k in updates) safe[k] = updates[k]; }

  const { data, error } = await supabaseAdmin
    .from('point_multipliers').update(safe).eq('id', id).eq('restaurant_id', ctx.restaurantId).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ multiplier: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('point_multipliers').delete().eq('id', id).eq('restaurant_id', ctx.restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
