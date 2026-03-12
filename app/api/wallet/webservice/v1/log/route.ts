export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const CTX = 'wallet/webservice/log';

/*
 * POST /api/wallet/webservice/v1/log
 *
 * Receive log messages from Apple Wallet devices for debugging.
 * No authentication required (Apple specification).
 *
 * Body: { "logs": ["message1", "message2"] }
 *
 * Always returns 200.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const logs = Array.isArray(body?.logs) ? body.logs : [];

    for (const message of logs) {
      logger.info({ ctx: CTX, msg: String(message) });
    }
  } catch {
    // Apple may send malformed requests; always return 200
    logger.warn({ ctx: CTX, msg: 'Failed to parse log request body' });
  }

  return new NextResponse(null, { status: 200 });
}
