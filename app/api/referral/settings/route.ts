import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const referralSettingsSchema = z.object({
  enabled:         z.boolean(),
  rewardReferrer:  z.number().int().min(0).max(500),
  rewardReferee:   z.number().int().min(0).max(500),
  maxPerCustomer:  z.number().int().min(1).max(100),
});

export async function PATCH(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;

  const { restaurantId } = guard;
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  const parsed = referralSettingsSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message).join(', ');
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const { enabled, rewardReferrer, rewardReferee, maxPerCustomer } = parsed.data;

  try {
    const { error } = await supabaseAdmin
      .from('loyalty_settings')
      .update({
        referral_enabled:          enabled,
        referral_reward_referrer:  rewardReferrer,
        referral_reward_referee:   rewardReferee,
        referral_max_per_customer: maxPerCustomer,
      })
      .eq('restaurant_id', restaurantId);

    if (error) {
      logger.error({ ctx: 'referral/settings', rid: restaurantId, msg: 'Failed to update referral settings', err: error.message });
      return NextResponse.json({ error: 'Erreur lors de la mise à jour des paramètres.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ ctx: 'referral/settings', rid: restaurantId, msg: 'Unexpected error updating referral settings', err });
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
