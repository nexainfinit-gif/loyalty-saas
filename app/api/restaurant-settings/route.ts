import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/restaurant-settings
 * Returns all settings for the authenticated restaurant.
 * Auth: any authenticated restaurant owner.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('restaurant_settings')
    .select('key, value, updated_at')
    .eq('restaurant_id', guard.restaurantId);

  if (error) {
    return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 });
  }

  const settings = Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
  return NextResponse.json({ settings });
}

/**
 * PUT /api/restaurant-settings
 * Upsert one or more settings for the authenticated restaurant.
 * Auth: any authenticated restaurant owner.
 *
 * Body: Record<string, string>  e.g. { average_ticket: "18.50" }
 * Values must be strings. Empty string is valid (clears the value).
 */
export async function PUT(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Corps invalide. Attendu: Record<string,string>.' }, { status: 400 });
  }

  const rows = Object.entries(body)
    .filter(([key]) => typeof key === 'string' && key.trim().length > 0)
    .map(([key, value]) => ({
      restaurant_id: guard.restaurantId!,
      key:           key.trim(),
      value:         String(value ?? ''),
      updated_at:    new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ settings: {} });
  }

  const { error } = await supabaseAdmin
    .from('restaurant_settings')
    .upsert(rows, { onConflict: 'restaurant_id,key' });

  if (error) {
    return NextResponse.json({ error: 'Erreur enregistrement paramètres.' }, { status: 500 });
  }

  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({ settings });
}
