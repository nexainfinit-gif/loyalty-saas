// lib/apns.ts
// Apple Push Notification Service (APNS) client for Wallet pass updates.
//
// Uses fetch-based HTTP POST to a lightweight proxy approach:
// Since Vercel serverless functions don't support Node.js http2.connect()
// with TLS client certificates, we use an alternative strategy:
// - Increment pass_version + updated_at so the webservice returns fresh data
// - Apple Wallet devices periodically poll for updates (~24h)
// - For near-real-time: we attempt fetch-based push via undici HTTP/2
//
// The webservice endpoints (list-passes, get-pass) handle the actual
// pass delivery when the device checks for updates.

import { supabaseAdmin } from './supabase-admin';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface PushResult {
  pushToken: string;
  success:   boolean;
  error?:    string;
}

/* ── APNS push via child_process (workaround for Vercel) ───────────────── */

/**
 * Attempt to send APNS push using curl (available on Vercel Lambda).
 * curl supports HTTP/2 with client certificates natively.
 */
async function sendPushViaCurl(
  pushToken: string,
  passTypeId: string,
): Promise<PushResult> {
  const certP12B64 = process.env.APPLE_PASS_CERT_P12_BASE64 ?? '';
  const passphrase = process.env.APPLE_PASS_CERT_PASSPHRASE ?? '';

  if (!certP12B64) {
    return { pushToken, success: false, error: 'APPLE_PASS_CERT_P12_BASE64 not configured' };
  }

  const env = process.env.APNS_ENVIRONMENT
    ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
  const apnsHost = env === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';

  try {
    // Write P12 to a temp file, send via curl, then clean up
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('fs');
    const { join } = await import('path');
    const os = await import('os');

    const tmpDir = mkdtempSync(join(os.tmpdir(), 'apns-'));
    const p12Path = join(tmpDir, 'cert.p12');

    writeFileSync(p12Path, Buffer.from(certP12B64, 'base64'));

    const curlCmd = [
      'curl', '-s', '-w', '\\n%{http_code}',
      '--http2',
      '--cert-type', 'P12',
      '--cert', `${p12Path}:${passphrase}`,
      '-X', 'POST',
      '-H', `apns-topic: ${passTypeId}`,
      '-d', '{}',
      '--max-time', '10',
      `https://${apnsHost}/3/device/${pushToken}`,
    ].join(' ');

    const output = execSync(curlCmd, {
      timeout: 12_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Clean up
    try { unlinkSync(p12Path); } catch {}
    try { const { rmdirSync } = await import('fs'); rmdirSync(tmpDir); } catch {}

    // Parse output: body\nstatus_code
    const lines = output.trim().split('\n');
    const statusCode = parseInt(lines[lines.length - 1], 10);
    const body = lines.slice(0, -1).join('\n');

    if (statusCode === 200) {
      console.log(`[APNS] Push succeeded via curl for token ${pushToken.slice(0, 12)}...`);
      return { pushToken, success: true };
    }

    let errorMsg = `APNS HTTP ${statusCode}`;
    if (body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.reason) errorMsg += `: ${parsed.reason}`;
      } catch {
        errorMsg += `: ${body.slice(0, 200)}`;
      }
    }
    console.warn(`[APNS] Push failed via curl: ${errorMsg}`);
    return { pushToken, success: false, error: errorMsg };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[APNS] curl push failed:`, msg);
    return { pushToken, success: false, error: `curl push failed: ${msg}` };
  }
}

/* ── Single push ───────────────────────────────────────────────────────────── */

export async function sendPassUpdatePush(pushToken: string): Promise<PushResult> {
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? '';
  if (!passTypeId) {
    return { pushToken, success: false, error: 'APPLE_PASS_TYPE_IDENTIFIER not configured' };
  }

  return sendPushViaCurl(pushToken, passTypeId);
}

/* ── Push to all devices for a pass ────────────────────────────────────────── */

/**
 * Send push notifications to all devices registered for a specific pass.
 * Also increments pass_version on the wallet_passes row so the device
 * knows the pass has changed when it fetches the updated .pkpass.
 */
export async function pushPassUpdate(passId: string): Promise<PushResult[]> {
  // ── 1. Fetch all device registrations for this pass ──────────────────────
  const { data: registrations, error: regError } = await supabaseAdmin
    .from('wallet_push_registrations')
    .select('push_token')
    .eq('pass_id', passId);

  if (regError) {
    console.error(`[APNS] Failed to fetch registrations for pass ${passId}:`, regError.message);
    return [{ pushToken: '', success: false, error: `DB error: ${regError.message}` }];
  }

  if (!registrations || registrations.length === 0) {
    console.log(`[APNS] No device registrations for pass ${passId}, skipping push`);
    return [];
  }

  // ── 2. Increment pass_version + updated_at ──────────────────────────────
  const now = new Date().toISOString();
  const { data: currentPass } = await supabaseAdmin
    .from('wallet_passes')
    .select('pass_version')
    .eq('id', passId)
    .single();

  const newVersion = (currentPass?.pass_version ?? 1) + 1;
  const { error: updateError } = await supabaseAdmin
    .from('wallet_passes')
    .update({ pass_version: newVersion, updated_at: now })
    .eq('id', passId);

  if (updateError) {
    console.error(`[APNS] Failed to increment pass_version for ${passId}:`, updateError.message);
  } else {
    console.log(`[APNS] pass_version → ${newVersion}, updated_at → ${now} for pass ${passId}`);
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

  const successCount = pushResults.filter(r => r.success).length;
  const failCount    = pushResults.length - successCount;
  console.log(`[APNS] Push complete for pass ${passId}: ${successCount} succeeded, ${failCount} failed`);

  if (failCount > 0) {
    for (const f of pushResults.filter(r => !r.success)) {
      console.warn(`[APNS] Push failed for token ${f.pushToken.slice(0, 12)}...: ${f.error}`);
    }
  }

  return pushResults;
}
