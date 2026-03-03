import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { evaluateRestaurantGrowth } from '@/lib/growth-triggers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/growth/triggers
 * Returns growth triggers for the authenticated restaurant owner.
 * Auth: any authenticated restaurant owner.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;

  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const triggers = await evaluateRestaurantGrowth(guard.restaurantId);
  return NextResponse.json({ triggers });
}
