// app/api/scanner-info/[token]/route.ts
//
// Public endpoint: validates a scanner_token and returns the restaurant's
// display name and brand color. Used by the public cashier scanner page
// (/scan/[scannerToken]) on mount to confirm the URL is valid before
// showing the scan UI.
//
// No sensitive data is returned — name and color are already visible on
// the public registration page for this restaurant.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'scanner-info', limit: 30, windowMs: 60_000 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(_req);
  const rl = limiter.check(ip);
  if (!rl.success) {
    return Response.json({ error: 'Trop de requêtes' }, { status: 429 });
  }

  const { token } = await params;

  if (!token || token.length < 10) {
    return Response.json({ error: 'Token invalide' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color')
    .eq('scanner_token', token)
    .maybeSingle();

  if (!restaurant) {
    return Response.json({ error: 'Token invalide' }, { status: 404 });
  }

  // Fetch active scan actions + loyalty settings for the scanner UI
  const [{ data: scanActions }, { data: loyaltySettings }] = await Promise.all([
    supabaseAdmin
      .from('scan_actions')
      .select('id, label, icon, points_value, sort_order')
      .eq('restaurant_id', restaurant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('loyalty_settings')
      .select('program_type, points_per_scan, stamps_total')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle(),
  ]);

  return Response.json({
    restaurant: {
      name:          restaurant.name,
      primary_color: restaurant.primary_color ?? '#4f6bed',
    },
    scan_actions: scanActions ?? [],
    loyalty_settings: loyaltySettings ? {
      program_type:   loyaltySettings.program_type ?? 'points',
      points_per_scan: loyaltySettings.points_per_scan ?? 1,
      stamps_total:   loyaltySettings.stamps_total ?? 10,
    } : null,
  });
}
