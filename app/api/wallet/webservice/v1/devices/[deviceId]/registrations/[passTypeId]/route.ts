export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

const CTX = 'wallet/webservice/list-passes';

type RouteParams = {
  params: Promise<{ deviceId: string; passTypeId: string }>;
};

/*
 * GET /api/wallet/webservice/v1/devices/:deviceId/registrations/:passTypeId
 *
 * Return the serial numbers of passes registered for a device.
 * No authentication required (Apple specification).
 *
 * Query params:
 *   passesUpdatedSince — ISO timestamp (optional)
 *
 * Returns:
 *   200 — { serialNumbers: [...], lastUpdated: "ISO timestamp" }
 *   204 — no matching passes
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { deviceId, passTypeId } = await params;
  const { searchParams } = new URL(request.url);
  const rawUpdatedSince = searchParams.get('passesUpdatedSince');
  // Apple sends "+00:00" but URL decoding turns "+" into " " — fix it
  const passesUpdatedSince = rawUpdatedSince?.replace(/ /g, '+') ?? null;

  // Build query: join registrations with wallet_passes to get updated_at
  let query = supabaseAdmin
    .from('wallet_push_registrations')
    .select('serial_number, wallet_passes!inner(updated_at)')
    .eq('device_id', deviceId)
    .eq('pass_type_id', passTypeId);

  if (passesUpdatedSince) {
    query = query.gt('wallet_passes.updated_at', passesUpdatedSince);
  }

  const { data: registrations, error } = await query;

  if (error) {
    logger.error({ ctx: CTX, msg: 'Failed to query registrations', err: error, deviceId, passTypeId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!registrations || registrations.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  // Extract serial numbers and find the latest updated_at
  const serialNumbers: string[] = [];
  let lastUpdated = '';

  for (const reg of registrations) {
    serialNumbers.push(reg.serial_number);

    // wallet_passes join can be object or array depending on Supabase response
    const wp = Array.isArray(reg.wallet_passes)
      ? reg.wallet_passes[0]
      : reg.wallet_passes;

    const updatedAt = (wp as { updated_at?: string })?.updated_at ?? '';
    if (updatedAt > lastUpdated) {
      lastUpdated = updatedAt;
    }
  }

  logger.info({ ctx: CTX, msg: 'Listed passes for device', deviceId, passTypeId, count: serialNumbers.length });

  return NextResponse.json({
    serialNumbers,
    lastUpdated: lastUpdated || new Date().toISOString(),
  });
}
