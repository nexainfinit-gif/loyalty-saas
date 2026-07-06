import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { ensureDefaultWalletTemplate } from '@/lib/wallet-template';

/**
 * POST /api/wallet/ensure-default-template
 *
 * Crée un template Wallet générique par défaut si le restaurant n'en a aucun.
 * Idempotent. Appelé automatiquement après la configuration du programme de
 * fidélité. requireAuth (pas requireOwner) : la création se fait côté serveur
 * via le service role, donc accessible à tout propriétaire de restaurant.
 */
export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const result = await ensureDefaultWalletTemplate(guard.restaurantId);
  return NextResponse.json(result);
}
