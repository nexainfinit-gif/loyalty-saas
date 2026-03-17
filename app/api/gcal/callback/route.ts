import { NextRequest, NextResponse } from 'next/server';
import { handleCallback } from '@/lib/google-calendar-sync';
import { logger } from '@/lib/logger';

/**
 * GET /api/gcal/callback
 * OAuth2 callback from Google. Exchanges code for tokens.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // restaurantId
  const error = searchParams.get('error');

  if (error) {
    logger.warn({ ctx: 'gcal/callback', msg: `OAuth error: ${error}` });
    return NextResponse.redirect(
      new URL('/dashboard/appointments/settings?gcal=error', request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/appointments/settings?gcal=error', request.url),
    );
  }

  const success = await handleCallback(code, state);

  return NextResponse.redirect(
    new URL(
      `/dashboard/appointments/settings?gcal=${success ? 'connected' : 'error'}`,
      request.url,
    ),
  );
}
