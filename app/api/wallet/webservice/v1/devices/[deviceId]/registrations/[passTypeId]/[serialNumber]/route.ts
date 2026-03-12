export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

const CTX = 'wallet/webservice/register';

/**
 * Validate the ApplePass authentication token from the Authorization header.
 * Returns the matching wallet_passes row or null if invalid.
 */
async function validateAuthToken(
  request: NextRequest,
  serialNumber: string,
  passTypeId: string,
) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^ApplePass\s+(.+)$/);
  if (!match) return null;

  const token = match[1];

  const { data: pass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, serial_number, authentication_token')
    .eq('serial_number', serialNumber)
    .eq('authentication_token', token)
    .maybeSingle();

  if (!pass) return null;

  // Optionally verify pass_type_id matches env config
  const expectedPassTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? '';
  if (expectedPassTypeId && passTypeId !== expectedPassTypeId) return null;

  return pass;
}

type RouteParams = {
  params: Promise<{ deviceId: string; passTypeId: string; serialNumber: string }>;
};

/*
 * POST /api/wallet/webservice/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber
 *
 * Register a device to receive push notifications for a pass.
 * Apple sends this when a pass is added to the Wallet app.
 *
 * Returns:
 *   201 — new registration created
 *   200 — existing registration updated
 *   401 — authentication failed
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { deviceId, passTypeId, serialNumber } = await params;

  const pass = await validateAuthToken(request, serialNumber, passTypeId);
  if (!pass) {
    logger.warn({ ctx: CTX, msg: 'Auth failed for device registration', deviceId, serialNumber });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { pushToken?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pushToken = body.pushToken;
  if (!pushToken || typeof pushToken !== 'string') {
    return NextResponse.json({ error: 'Missing pushToken' }, { status: 400 });
  }

  // Check if registration already exists
  const { data: existing } = await supabaseAdmin
    .from('wallet_push_registrations')
    .select('id')
    .eq('device_id', deviceId)
    .eq('pass_type_id', passTypeId)
    .eq('serial_number', serialNumber)
    .maybeSingle();

  if (existing) {
    // Update push token
    await supabaseAdmin
      .from('wallet_push_registrations')
      .update({ push_token: pushToken, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    logger.info({ ctx: CTX, msg: 'Device registration updated', deviceId, serialNumber });
    return new NextResponse(null, { status: 200 });
  }

  // Insert new registration
  const { error: insertErr } = await supabaseAdmin
    .from('wallet_push_registrations')
    .insert({
      device_id: deviceId,
      push_token: pushToken,
      pass_id: pass.id,
      serial_number: serialNumber,
      pass_type_id: passTypeId,
    });

  if (insertErr) {
    logger.error({ ctx: CTX, msg: 'Failed to insert registration', err: insertErr, deviceId, serialNumber });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  logger.info({ ctx: CTX, msg: 'Device registered for pass', deviceId, serialNumber });
  return new NextResponse(null, { status: 201 });
}

/*
 * DELETE /api/wallet/webservice/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber
 *
 * Unregister a device so it no longer receives push notifications for a pass.
 * Apple sends this when a pass is removed from the Wallet app.
 *
 * Returns:
 *   200 — registration deleted
 *   401 — authentication failed
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { deviceId, passTypeId, serialNumber } = await params;

  const pass = await validateAuthToken(request, serialNumber, passTypeId);
  if (!pass) {
    logger.warn({ ctx: CTX, msg: 'Auth failed for device unregistration', deviceId, serialNumber });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('wallet_push_registrations')
    .delete()
    .eq('device_id', deviceId)
    .eq('pass_type_id', passTypeId)
    .eq('serial_number', serialNumber);

  if (deleteErr) {
    logger.error({ ctx: CTX, msg: 'Failed to delete registration', err: deleteErr, deviceId, serialNumber });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  logger.info({ ctx: CTX, msg: 'Device unregistered from pass', deviceId, serialNumber });
  return new NextResponse(null, { status: 200 });
}
