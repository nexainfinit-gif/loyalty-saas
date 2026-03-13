// lib/apns.ts
// Apple Push Notification Service (APNS) client for Wallet pass updates.
//
// Apple Wallet passes use a special push flow: send an empty push notification
// to tell the device to fetch the updated pass from our web service endpoint.
// The push body is literally `{}` — Apple Wallet just needs the nudge.
//
// Uses HTTP/2 (required by Apple) with the Pass Type Certificate (P12/PFX)
// for TLS client authentication.

import * as http2 from 'http2';
import { supabaseAdmin } from './supabase-admin';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const APNS_PRODUCTION = 'https://api.push.apple.com';
const APNS_SANDBOX    = 'https://api.sandbox.push.apple.com';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface PushResult {
  pushToken: string;
  success:   boolean;
  error?:    string;
}

/* ── APNS gateway selection ────────────────────────────────────────────────── */

function getApnsUrl(): string {
  // Use sandbox in development, production otherwise.
  // Can be overridden with APNS_ENVIRONMENT=production|sandbox
  const env = process.env.APNS_ENVIRONMENT
    ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
  return env === 'production' ? APNS_PRODUCTION : APNS_SANDBOX;
}

/* ── Single push ───────────────────────────────────────────────────────────── */

/**
 * Send an empty push notification to a single Apple device.
 * This tells the device to contact our web service to fetch the updated pass.
 */
export async function sendPassUpdatePush(pushToken: string): Promise<PushResult> {
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? '';
  if (!passTypeId) {
    return {
      pushToken,
      success: false,
      error:   'APPLE_PASS_TYPE_IDENTIFIER not configured',
    };
  }

  const certP12B64 = process.env.APPLE_PASS_CERT_P12_BASE64 ?? '';
  const passphrase = process.env.APPLE_PASS_CERT_PASSPHRASE ?? '';

  if (!certP12B64) {
    return {
      pushToken,
      success: false,
      error:   'APPLE_PASS_CERT_P12_BASE64 not configured',
    };
  }

  const apnsUrl = getApnsUrl();
  console.log(`[APNS] Connecting to ${apnsUrl} for token ${pushToken.slice(0, 12)}...`);

  return new Promise<PushResult>((resolve) => {
    let client: http2.ClientHttp2Session | null = null;
    let resolved = false;

    const safeResolve = (result: PushResult) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    try {
      // Use P12/PFX directly — more reliable than extracting PEM via node-forge
      client = http2.connect(apnsUrl, {
        pfx:        Buffer.from(certP12B64, 'base64'),
        passphrase: passphrase,
      });

      client.on('error', (err) => {
        console.error(`[APNS] HTTP/2 connection error:`, err.message);
        safeResolve({
          pushToken,
          success: false,
          error:   `HTTP/2 connection error: ${err.message}`,
        });
        client?.close();
      });

      const req = client.request({
        ':method':       'POST',
        ':path':         `/3/device/${pushToken}`,
        'apns-topic':    passTypeId,
      });

      // Set a timeout to avoid hanging connections
      req.setTimeout(15_000, () => {
        req.close(http2.constants.NGHTTP2_CANCEL);
        safeResolve({
          pushToken,
          success: false,
          error:   'APNS request timed out (15s)',
        });
        client?.close();
      });

      let responseStatus = 0;
      let responseBody   = '';

      req.on('response', (headers) => {
        responseStatus = Number(headers[':status'] ?? 0);
      });

      req.on('data', (chunk: Buffer) => {
        responseBody += chunk.toString();
      });

      req.on('end', () => {
        client?.close();
        if (responseStatus === 200) {
          console.log(`[APNS] Push succeeded for token ${pushToken.slice(0, 12)}...`);
          safeResolve({ pushToken, success: true });
        } else {
          let errorMsg = `APNS HTTP ${responseStatus}`;
          if (responseBody) {
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed.reason) errorMsg += `: ${parsed.reason}`;
            } catch {
              errorMsg += `: ${responseBody.slice(0, 200)}`;
            }
          }
          console.warn(`[APNS] Push failed: ${errorMsg}`);
          safeResolve({ pushToken, success: false, error: errorMsg });
        }
      });

      req.on('error', (err) => {
        client?.close();
        console.error(`[APNS] Request error:`, err.message);
        safeResolve({
          pushToken,
          success: false,
          error:   `APNS request error: ${err.message}`,
        });
      });

      // Apple Wallet pass updates use an empty JSON body
      req.end(JSON.stringify({}));

    } catch (err) {
      client?.close();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[APNS] Push exception:`, msg);
      safeResolve({
        pushToken,
        success: false,
        error:   `APNS push failed: ${msg}`,
      });
    }
  });
}

/* ── Push to all devices for a pass ────────────────────────────────────────── */

/**
 * Send push notifications to all devices registered for a specific pass.
 * Also increments pass_version on the wallet_passes row so the device
 * knows the pass has changed when it fetches the updated .pkpass.
 *
 * @param passId — UUID of the wallet_passes row
 * @returns Array of push results (one per registered device)
 */
export async function pushPassUpdate(passId: string): Promise<PushResult[]> {
  // ── 1. Fetch all device registrations for this pass ──────────────────────
  const { data: registrations, error: regError } = await supabaseAdmin
    .from('wallet_push_registrations')
    .select('push_token')
    .eq('pass_id', passId);

  if (regError) {
    console.error(`[APNS] Failed to fetch registrations for pass ${passId}:`, regError.message);
    return [{
      pushToken: '',
      success:   false,
      error:     `DB error fetching registrations: ${regError.message}`,
    }];
  }

  if (!registrations || registrations.length === 0) {
    // No devices registered — not an error, just nothing to push
    return [];
  }

  // ── 2. Increment pass_version ────────────────────────────────────────────
  const { error: versionError } = await supabaseAdmin
    .rpc('increment_pass_version', { p_pass_id: passId })
    .single();

  // If the RPC doesn't exist yet, fall back to a manual update
  if (versionError) {
    const { error: updateError } = await supabaseAdmin
      .from('wallet_passes')
      .update({
        pass_version: (await supabaseAdmin
          .from('wallet_passes')
          .select('pass_version')
          .eq('id', passId)
          .single()
          .then(r => (r.data?.pass_version ?? 1))) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', passId);

    if (updateError) {
      console.error(`[APNS] Failed to increment pass_version for ${passId}:`, updateError.message);
    }
  }

  // ── 3. Send push to each registered device ───────────────────────────────
  const uniqueTokens = Array.from(new Set(registrations.map(r => r.push_token)));

  console.log(`[APNS] Sending push to ${uniqueTokens.length} device(s) for pass ${passId}`);

  const results = await Promise.allSettled(
    uniqueTokens.map(token => sendPassUpdatePush(token)),
  );

  const pushResults: PushResult[] = results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      pushToken: uniqueTokens[i],
      success:   false,
      error:     result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  // Log summary
  const successCount = pushResults.filter(r => r.success).length;
  const failCount    = pushResults.length - successCount;
  console.log(
    `[APNS] Push complete for pass ${passId}: ${successCount} succeeded, ${failCount} failed`,
  );

  if (failCount > 0) {
    const failures = pushResults.filter(r => !r.success);
    for (const f of failures) {
      console.warn(`[APNS] Push failed for token ${f.pushToken.slice(0, 12)}...: ${f.error}`);
    }
  }

  return pushResults;
}
