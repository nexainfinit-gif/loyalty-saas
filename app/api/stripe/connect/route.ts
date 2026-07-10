import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { ensureConnectAccount, createOnboardingLink, getConnectStatus } from '@/lib/stripe-connect';
import { logger } from '@/lib/logger';

/**
 * GET  /api/stripe/connect — statut du compte connecté du commerçant.
 * POST /api/stripe/connect — crée le compte (si besoin) + lien d'onboarding.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  try {
    const status = await getConnectStatus(guard.restaurantId);
    return NextResponse.json(status);
  } catch (err) {
    logger.error({ ctx: 'stripe-connect', rid: guard.restaurantId, msg: 'status failed', err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Impossible de récupérer le statut Stripe.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  let locale = 'fr';
  // Liste blanche des pages de retour (pas de redirection arbitraire).
  const RETURN_PATHS = ['/dashboard/appointments/settings', '/dashboard/events'];
  let returnPath = RETURN_PATHS[0];
  try {
    const body = await request.json();
    if (typeof body?.locale === 'string' && /^[a-z]{2}$/.test(body.locale)) locale = body.locale;
    if (typeof body?.returnPath === 'string' && RETURN_PATHS.includes(body.returnPath)) returnPath = body.returnPath;
  } catch { /* body optionnel */ }

  try {
    const accountId = await ensureConnectAccount(guard.restaurantId);
    const url = await createOnboardingLink(accountId, locale, returnPath);
    return NextResponse.json({ url });
  } catch (err) {
    logger.error({ ctx: 'stripe-connect', rid: guard.restaurantId, msg: 'onboarding failed', err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Impossible de démarrer la connexion Stripe.' }, { status: 500 });
  }
}
