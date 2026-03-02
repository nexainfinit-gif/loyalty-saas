import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me
 * Returns the authenticated user's context.
 * Auth: Bearer token (primary) → cookie session (fallback).
 */
export async function GET(request: Request) {
  const ctx = await getAuthContext(request);

  if (!ctx) {
    return NextResponse.json(
      { userId: null, restaurantId: null, walletStudio: false, platformRole: null },
      { status: 401 },
    );
  }

  return NextResponse.json({
    userId:        ctx.userId,
    restaurantId:  ctx.restaurantId,
    walletStudio:  ctx.walletEnabled,   // true if plan !== 'free' or wallet_studio_enabled = true
    platformRole:  ctx.platformRole,
    plan:          ctx.plan,
  });
}
