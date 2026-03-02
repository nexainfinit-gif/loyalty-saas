// app/api/unsubscribe/route.ts
//
// Public, unauthenticated endpoint for one-click email unsubscribe.
// GDPR / CAN-SPAM compliant: sets the marketing consent flag to false for the
// customer identified by their qr_token.
//
// Security notes:
//   • Token is the customer's qr_token (UUID v4, random, not guessable).
//   • Only possible side-effect: setting the marketing consent flag to false.
//   • No customer data is exposed in the response (generic HTML only).
//   • Idempotent: safe to call multiple times.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest } from 'next/server';

// ── Column name resolution ─────────────────────────────────────────────────
// The codebase has an inconsistency: CLAUDE.md documents the column as
// "marketing_consent" while the register/campaigns routes use "consent_marketing".
// We attempt the update with both names so the endpoint works regardless.
const CONSENT_COLUMNS = ['consent_marketing', 'marketing_consent'] as const;

export async function GET(req: NextRequest) {
  // Strip any surrounding { } that can end up in the URL if copied literally
  // from a template placeholder (e.g. token={uuid} → token=uuid).
  const raw   = req.nextUrl.searchParams.get('token') ?? '';
  const token = raw.replace(/^\{|\}$/g, '');

  console.log('[unsubscribe] raw token received:', JSON.stringify(raw));
  console.log('[unsubscribe] cleaned token:', JSON.stringify(token));

  if (!token || token.length < 10) {
    console.log('[unsubscribe] rejected: token too short');
    return pageResponse(400, 'error');
  }

  // ── Step 1: look up customer by qr_token (select only id — avoids any
  //    column-name ambiguity in the SELECT clause) ─────────────────────────
  const { data: customer, error: lookupError } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('qr_token', token)
    .maybeSingle();

  console.log('[unsubscribe] lookup result — customer:', customer, '| error:', lookupError);

  if (lookupError) {
    console.error('[unsubscribe] lookup error:', lookupError.message, lookupError.code);
    return pageResponse(500, 'error');
  }

  // Same response for not-found and invalid token → prevents token enumeration.
  if (!customer) {
    return pageResponse(404, 'error');
  }

  // ── Step 2: set marketing consent to false ─────────────────────────────
  // Try each possible column name until one succeeds.
  let updated = false;
  for (const col of CONSENT_COLUMNS) {
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({ [col]: false })
      .eq('id', customer.id);

    if (!updateError) {
      updated = true;
      break;
    }
    // Log non-fatal: column may simply not exist under this name.
    console.warn(`[unsubscribe] update with col="${col}" failed:`, updateError.message);
  }

  if (!updated) {
    console.error('[unsubscribe] all column name attempts failed for customer:', customer.id);
    return pageResponse(500, 'error');
  }

  return pageResponse(200, 'success');
}

/* ── HTML response builder ────────────────────────────────────────────────── */

type State = 'success' | 'error';

const CONTENT: Record<State, { icon: string; title: string; body: string }> = {
  success: {
    icon: '✅',
    title: 'Désinscription confirmée',
    body: `Vous ne recevrez plus d'emails marketing de notre part.<br/>
           Votre carte fidélité reste active et vous pouvez continuer à gagner des points.`,
  },
  error: {
    icon: '⚠️',
    title: 'Lien invalide',
    body: `Ce lien de désinscription est invalide ou a expiré.<br/>
           Répondez directement à cet email pour vous désinscrire.`,
  },
};

function pageResponse(status: number, state: State): Response {
  const { icon, title, body } = CONTENT[state];
  return new Response(
    `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#f6f8fb;min-height:100vh;display:flex;
         align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:20px;padding:48px 36px;
          text-align:center;max-width:440px;width:100%;
          box-shadow:0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)}
    .icon{font-size:3rem;margin-bottom:20px;line-height:1}
    h1{font-size:1.375rem;font-weight:700;color:#111827;margin-bottom:12px}
    p{font-size:0.9375rem;color:#6b7280;line-height:1.65}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
