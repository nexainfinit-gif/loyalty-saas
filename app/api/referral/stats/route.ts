import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { logger } from '@/lib/logger';

export async function GET(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;

  const { restaurantId } = guard;
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  try {
    const { getReferralConfig, getReferralStats } = await import('@/lib/referral');

    const [config, stats] = await Promise.all([
      getReferralConfig(restaurantId),
      getReferralStats(restaurantId),
    ]);

    return NextResponse.json({ config, stats });
  } catch (err) {
    logger.error({ ctx: 'referral/stats', rid: restaurantId, msg: 'Failed to fetch referral stats', err });
    return NextResponse.json({ error: 'Erreur lors du chargement des statistiques de parrainage.' }, { status: 500 });
  }
}
