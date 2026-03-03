import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/growth/actions
 * Returns platform-wide pending + in_progress growth actions, newest first.
 * Auth: platform owner only.
 *
 * Query params:
 *   ?restaurant_id=<uuid>   — filter to a single restaurant
 *   ?status=pending         — filter by status (default: pending,in_progress)
 *   ?limit=50               — max rows (default: 50, max: 200)
 *
 * Response: { actions: GrowthActionRow[] }
 */

export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const url    = new URL(request.url);
  const restId = url.searchParams.get('restaurant_id');
  const status = url.searchParams.get('status');
  const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

  let query = supabaseAdmin
    .from('growth_actions')
    .select(`
      id,
      restaurant_id,
      trigger_key,
      action_type,
      payload,
      status,
      created_at,
      executed_at,
      restaurants ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (restId) {
    query = query.eq('restaurant_id', restId);
  }

  if (status) {
    query = query.eq('status', status);
  } else {
    query = query.in('status', ['pending', 'in_progress']);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admin/growth/actions] fetch error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ actions: data ?? [] });
}
