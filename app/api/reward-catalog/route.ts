import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';

// GET — list rewards for the authenticated restaurant
export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data, error } = await supabaseAdmin
    .from('reward_catalog')
    .select('*')
    .eq('restaurant_id', ctx.restaurantId)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rewards: data ?? [] });
}

// POST — create a new reward
export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, type, value, points_cost, icon } = body as {
    name?: string; type?: string; value?: number; points_cost?: number; icon?: string;
  };

  if (!name || !type) return NextResponse.json({ error: 'name and type are required' }, { status: 400 });
  if (!['free_product', 'percent_discount', 'fixed_discount', 'custom'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data, error } = await supabaseAdmin
    .from('reward_catalog')
    .insert({
      restaurant_id: ctx.restaurantId,
      name,
      type,
      value: value ?? null,
      points_cost: points_cost ?? 0,
      icon: icon ?? '🎁',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reward: data }, { status: 201 });
}

// PATCH — update a reward
export async function PATCH(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { id, ...updates } = body as { id?: string; [key: string]: unknown };
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Only allow safe fields
  const allowed = ['name', 'type', 'value', 'points_cost', 'icon', 'active', 'sort_order'];
  const safe: Record<string, unknown> = {};
  for (const k of allowed) { if (k in updates) safe[k] = updates[k]; }

  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data, error } = await supabaseAdmin
    .from('reward_catalog')
    .update(safe)
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reward: data });
}

// DELETE — remove a reward
export async function DELETE(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: 'No restaurant' }, { status: 400 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { error } = await supabaseAdmin
    .from('reward_catalog')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
