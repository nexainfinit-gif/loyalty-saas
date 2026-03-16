// app/api/admin/impersonate/route.ts
//
// Sets or clears the impersonation cookie for demo mode.
// POST { restaurant_id } → sets cookie (1 hour)
// DELETE → clears cookie

import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => ({}));
  const restaurantId = body.restaurant_id;

  if (!restaurantId || typeof restaurantId !== 'string') {
    return Response.json({ error: 'restaurant_id requis' }, { status: 400 });
  }

  // Verify restaurant exists
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name')
    .eq('id', restaurantId)
    .maybeSingle();

  if (!restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 });
  }

  const response = Response.json({ ok: true, restaurant: restaurant.name });
  // Set httpOnly cookie — 1 hour expiry
  const headers = new Headers(response.headers);
  headers.append(
    'Set-Cookie',
    `x-admin-impersonate=${restaurantId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`,
  );

  return new Response(response.body, {
    status: 200,
    headers,
  });
}

export async function DELETE(req: Request) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  const response = Response.json({ ok: true });
  const headers = new Headers(response.headers);
  headers.append(
    'Set-Cookie',
    'x-admin-impersonate=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
  );

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
