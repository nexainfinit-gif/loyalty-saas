import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('vip_tiers')
    .select('*')
    .eq('restaurant_id', ctx.restaurantId)
    .order('min_points', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tiers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, min_points, icon, color, perk } = body as {
    name?: string; min_points?: number; icon?: string; color?: string; perk?: string;
  };
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('vip_tiers')
    .insert({ restaurant_id: ctx.restaurantId, name, min_points: min_points ?? 0, icon: icon ?? '⭐', color: color ?? '#F59E0B', perk: perk ?? '' })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data }, { status: 201 });
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

  const allowed = ['name', 'min_points', 'icon', 'color', 'perk', 'sort_order'];
  const safe: Record<string, unknown> = {};
  for (const k of allowed) { if (k in updates) safe[k] = updates[k]; }

  const { data, error } = await supabaseAdmin
    .from('vip_tiers').update(safe).eq('id', id).eq('restaurant_id', ctx.restaurantId).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('vip_tiers').delete().eq('id', id).eq('restaurant_id', ctx.restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
