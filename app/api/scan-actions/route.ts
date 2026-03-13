// app/api/scan-actions/route.ts
// CRUD for scan action buttons — owner only

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import { NextResponse } from 'next/server';

const MAX_ACTIONS = 10;

/* ── GET — list scan actions for the restaurant ──────────────────────────── */

export async function GET(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('scan_actions')
    .select('id, label, icon, points_value, sort_order, is_active, created_at')
    .eq('restaurant_id', guard.restaurantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ actions: data ?? [] });
}

/* ── POST — create a new scan action ──────────────────────────────────── */

export async function POST(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { label, icon, points_value, sort_order } = body;

  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    return Response.json({ error: 'Label is required' }, { status: 400 });
  }
  if (typeof points_value !== 'number' || points_value < 1 || points_value > 1000) {
    return Response.json({ error: 'points_value must be between 1 and 1000' }, { status: 400 });
  }

  // Check limit
  const { count } = await supabaseAdmin
    .from('scan_actions')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', guard.restaurantId);

  if ((count ?? 0) >= MAX_ACTIONS) {
    return Response.json({ error: `Maximum ${MAX_ACTIONS} actions allowed` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('scan_actions')
    .insert({
      restaurant_id: guard.restaurantId,
      label: label.trim(),
      icon: icon || null,
      points_value,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
    })
    .select('id, label, icon, points_value, sort_order, is_active, created_at')
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ action: data }, { status: 201 });
}

/* ── PATCH — update an existing scan action ───────────────────────────── */

export async function PATCH(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, label, icon, points_value, sort_order, is_active } = body;

  if (!id || typeof id !== 'string') {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (label !== undefined) {
    if (typeof label !== 'string' || label.trim().length === 0) {
      return Response.json({ error: 'Label cannot be empty' }, { status: 400 });
    }
    updates.label = label.trim();
  }
  if (icon !== undefined) updates.icon = icon || null;
  if (points_value !== undefined) {
    if (typeof points_value !== 'number' || points_value < 1 || points_value > 1000) {
      return Response.json({ error: 'points_value must be between 1 and 1000' }, { status: 400 });
    }
    updates.points_value = points_value;
  }
  if (typeof sort_order === 'number') updates.sort_order = sort_order;
  if (typeof is_active === 'boolean') updates.is_active = is_active;

  const { data, error } = await supabaseAdmin
    .from('scan_actions')
    .update(updates)
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId)
    .select('id, label, icon, points_value, sort_order, is_active, created_at')
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ action: data });
}

/* ── DELETE — hard-delete a scan action ───────────────────────────────── */

export async function DELETE(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('scan_actions')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
