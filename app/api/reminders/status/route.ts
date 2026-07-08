import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getReminderQuotaState } from '@/lib/plan-limits';
import { REMINDER_PACKS } from '@/lib/reminder-packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/reminders/status
 * État du quota de rappels WhatsApp du restaurant courant (pour l'UI réglages).
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('plan, reminder_credits')
    .eq('id', guard.restaurantId)
    .single();

  const credits = (restaurant?.reminder_credits as number) ?? 0;
  const state = await getReminderQuotaState(guard.restaurantId, restaurant?.plan ?? null, credits);

  return NextResponse.json({
    included: state.included,          // -1 = illimité
    used: state.used,
    remainingIncluded: state.unlimited ? -1 : Math.max(0, state.included - state.used),
    credits: state.credits,
    unlimited: state.unlimited,
    packs: Object.entries(REMINDER_PACKS).map(([id, p]) => ({
      id,
      credits: p.credits,
      priceCents: p.priceCents,
      label: p.label,
    })),
  });
}
