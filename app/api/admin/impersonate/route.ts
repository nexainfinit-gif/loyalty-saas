// app/api/admin/impersonate/route.ts
//
// Sets or clears the impersonation cookie for demo mode.
// POST { restaurant_id } → sets cookie (1 hour)
// DELETE → clears cookie

import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'admin-impersonate', limit: 10, windowMs: 60_000 });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.success) {
    return Response.json({ error: 'Trop de requêtes' }, { status: 429 });
  }

  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => ({}));
  const restaurantId = body.restaurant_id;

  if (!restaurantId || typeof restaurantId !== 'string' || !UUID_RE.test(restaurantId)) {
    return Response.json({ error: 'restaurant_id requis (UUID)' }, { status: 400 });
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
    `x-admin-impersonate=${restaurantId}; Path=/; SameSite=Strict; Max-Age=3600`,
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
    'x-admin-impersonate=; Path=/; SameSite=Strict; Max-Age=0',
  );

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
