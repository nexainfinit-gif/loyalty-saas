import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/restaurant-wallet/active-customers
 *
 * Returns the list of customer IDs that have at least one active wallet pass
 * for the authenticated restaurant. Used by the dashboard Clients table to
 * show per-row wallet status without a per-customer round-trip.
 *
 * Auth: any authenticated restaurant owner.
 * The caller is responsible for showing this data only when the wallet_pass_rate
 * KPI is enabled for their plan (checked client-side via enabledKpiKeys).
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;

  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('wallet_passes')
    .select('customer_id')
    .eq('restaurant_id', guard.restaurantId)
    .eq('status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate — a customer may have both Apple and Google passes
  const customerIds = [...new Set((data ?? []).map((r) => r.customer_id))];

  return NextResponse.json({ customerIds });
}
