import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import { auditLog } from '@/lib/audit';

const lookupSchema = z.object({ code: z.string().trim().min(4).max(20) });

/**
 * GET  /api/packages/redeem?code=XXXX-XXXX — état d'un forfait (commerçant).
 * POST /api/packages/redeem { code }       — consomme UNE séance.
 * Scopé au restaurant du commerçant. Décrément concurrent-safe (compare-and-swap
 * sur sessions_used) → impossible de consommer deux séances en même temps.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase() ?? '';
  const parsed = lookupSchema.safeParse({ code });
  if (!parsed.success) return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });

  const { data: cp } = await supabaseAdmin
    .from('customer_packages')
    .select('code, name, customer_name, sessions_total, sessions_used, status, expires_at')
    .eq('restaurant_id', guard.restaurantId)
    .eq('code', parsed.data.code)
    .maybeSingle();

  if (!cp) return NextResponse.json({ error: 'Forfait introuvable.' }, { status: 404 });
  const expired = cp.expires_at && new Date(cp.expires_at) < new Date();
  return NextResponse.json({
    package: { ...cp, remaining: cp.sessions_total - cp.sessions_used, expired },
  });
}

export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = lookupSchema.safeParse({ code: String((body as { code?: string })?.code ?? '').trim().toUpperCase() });
  if (!parsed.success) return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });

  const { data: cp } = await supabaseAdmin
    .from('customer_packages')
    .select('id, status, sessions_total, sessions_used, expires_at')
    .eq('restaurant_id', guard.restaurantId)
    .eq('code', parsed.data.code)
    .maybeSingle();

  if (!cp) return NextResponse.json({ error: 'Forfait introuvable.' }, { status: 404 });
  if (cp.status === 'depleted' || cp.sessions_used >= cp.sessions_total) {
    return NextResponse.json({ error: 'Ce forfait est épuisé.' }, { status: 409 });
  }
  if (cp.status !== 'active') return NextResponse.json({ error: 'Ce forfait n\'est pas valide.' }, { status: 400 });
  if (cp.expires_at && new Date(cp.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Ce forfait a expiré.' }, { status: 400 });
  }

  const nextUsed = cp.sessions_used + 1;
  const nextStatus = nextUsed >= cp.sessions_total ? 'depleted' : 'active';

  // Compare-and-swap : n'applique que si sessions_used n'a pas changé entre-temps.
  const { data: updated } = await supabaseAdmin
    .from('customer_packages')
    .update({ sessions_used: nextUsed, status: nextStatus })
    .eq('id', cp.id)
    .eq('status', 'active')
    .eq('sessions_used', cp.sessions_used)
    .select('id')
    .maybeSingle();
  if (!updated) return NextResponse.json({ error: 'Séance déjà consommée. Réessayez.' }, { status: 409 });

  auditLog({
    restaurantId: guard.restaurantId,
    actorId: guard.userId,
    action: 'package_redeem',
    targetType: 'customer_package',
    targetId: cp.id,
    metadata: { used: nextUsed, total: cp.sessions_total },
  });

  return NextResponse.json({
    success: true,
    remaining: cp.sessions_total - nextUsed,
    total: cp.sessions_total,
    depleted: nextStatus === 'depleted',
  });
}
