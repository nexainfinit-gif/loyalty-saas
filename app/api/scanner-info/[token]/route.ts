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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || token.length < 10) {
    return Response.json({ error: 'Token invalide' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('name, primary_color')
    .eq('scanner_token', token)
    .maybeSingle();

  if (!restaurant) {
    return Response.json({ error: 'Token invalide' }, { status: 404 });
  }

  return Response.json({
    restaurant: {
      name:          restaurant.name,
      primary_color: restaurant.primary_color ?? '#4f6bed',
    },
  });
}
