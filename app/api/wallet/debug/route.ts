import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

/**
 * GET /api/wallet/debug?passId={uuid}
 *
 * Returns the full scan-identity picture for a given wallet pass so you can
 * verify what the QR encodes vs what's displayed vs what the scan route resolves.
 *
 * Response shape:
 * {
 *   pass:    { id, short_code, object_id, platform, status, sync_error, last_synced_at },
 *   customer:{ id, qr_token, first_name, last_name },
 *   scan_identity: {
 *     barcode_value:  string   // what the QR encodes (= customer.qr_token) → camera scan path
 *     alternate_text: string   // what's displayed under the QR (= pass.short_code)
 *     manual_code:    string   // what to type in the scanner UI (= pass.short_code)
 *     resolution_paths: string[] // which lookups the scan route would accept
 *   }
 * }
 */
export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const passId = searchParams.get('passId');

  if (!passId) {
    return NextResponse.json({ error: 'passId query param manquant.' }, { status: 400 });
  }

  // Fetch pass (scoped to this restaurant for security)
  const { data: pass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, short_code, object_id, platform, status, sync_error, last_synced_at, customer_id')
    .eq('id', passId)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();

  if (!pass) {
    return NextResponse.json({ error: 'Pass introuvable.' }, { status: 404 });
  }

  // Fetch customer
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, qr_token, first_name, last_name')
    .eq('id', pass.customer_id)
    .maybeSingle();

  // Derived scan identity
  const barcodeValue  = customer?.qr_token ?? customer?.id ?? null;
  const manualCode    = pass.short_code ?? (barcodeValue ? barcodeValue.replace(/-/g, '').slice(0, 8).toUpperCase() : null);
  const resolutionPaths: string[] = [];

  if (customer?.qr_token) resolutionPaths.push(`qr_token lookup: "${customer.qr_token}"`);
  resolutionPaths.push(`id lookup: "${customer?.id}"`);
  if (pass.short_code)    resolutionPaths.push(`short_code lookup: "${pass.short_code}"`);

  return NextResponse.json({
    pass: {
      id:             pass.id,
      short_code:     pass.short_code,
      object_id:      pass.object_id,
      platform:       pass.platform,
      status:         pass.status,
      sync_error:     pass.sync_error,
      last_synced_at: pass.last_synced_at,
    },
    customer: {
      id:         customer?.id,
      qr_token:   customer?.qr_token,
      first_name: customer?.first_name,
      last_name:  customer?.last_name,
    },
    scan_identity: {
      barcode_value:    barcodeValue,
      alternate_text:   manualCode,
      manual_code:      manualCode,
      resolution_paths: resolutionPaths,
    },
  });
}
