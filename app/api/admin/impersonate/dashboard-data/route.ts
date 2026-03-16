// app/api/admin/impersonate/dashboard-data/route.ts
//
// Proxy endpoint that loads all dashboard data for an impersonated restaurant.
// Uses supabaseAdmin to bypass RLS (the platform owner's JWT cannot read
// another restaurant's data through the anon client).

import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  // Read impersonation cookie
  const cookieHeader = req.headers.get('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)x-admin-impersonate=([^;]+)/);
  const restaurantId = match?.[1]?.trim();

  if (!restaurantId) {
    return Response.json({ error: 'Pas de restaurant impersonné' }, { status: 400 });
  }

  // Load all dashboard data in parallel via supabaseAdmin (bypasses RLS)
  const [
    { data: restaurant },
    { data: customers },
    { data: transactions },
    { data: loyaltySettings },
    { data: campaigns },
    { count: templateCount },
  ] = await Promise.all([
    supabaseAdmin
      .from('restaurants')
      .select('id, name, slug, primary_color, logo_url, business_type, plan, plan_id, scanner_token, subscription_status, current_period_end, stripe_customer_id, tutorial_completed_at, is_demo, plans(name, key)')
      .eq('id', restaurantId)
      .maybeSingle(),
    supabaseAdmin
      .from('customers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseAdmin
      .from('loyalty_settings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
    supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('wallet_pass_templates')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId),
  ]);

  if (!restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 });
  }

  // Load restaurant_settings (key-value store)
  const { data: settingsRows } = await supabaseAdmin
    .from('restaurant_settings')
    .select('key, value')
    .eq('restaurant_id', restaurantId);

  const restaurantSettings: Record<string, string> = {};
  for (const row of settingsRows ?? []) {
    restaurantSettings[row.key] = row.value;
  }

  return Response.json({
    restaurant,
    customers: customers ?? [],
    transactions: transactions ?? [],
    loyaltySettings: loyaltySettings ?? null,
    campaigns: campaigns ?? [],
    restaurantSettings,
    templateCount: templateCount ?? 0,
  });
}
