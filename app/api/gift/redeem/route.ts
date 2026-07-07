import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import { auditLog } from '@/lib/audit';

const lookupSchema = z.object({ code: z.string().trim().min(4).max(20) });

/**
 * GET  /api/gift/redeem?code=XXXX-XXXX — recherche d'un bon (commerçant).
 * POST /api/gift/redeem { code }       — marque le bon comme utilisé.
 * Scopé au restaurant du commerçant : impossible de racheter le bon d'un autre.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase() ?? '';
  const parsed = lookupSchema.safeParse({ code });
  if (!parsed.success) return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });

  const { data: voucher } = await supabaseAdmin
    .from('gift_vouchers')
    .select('code, amount, status, buyer_name, recipient_name, expires_at, redeemed_at')
    .eq('restaurant_id', guard.restaurantId)
    .eq('code', parsed.data.code)
    .maybeSingle();

  if (!voucher) return NextResponse.json({ error: 'Bon introuvable.' }, { status: 404 });
  const expired = voucher.expires_at && new Date(voucher.expires_at) < new Date();
  return NextResponse.json({ voucher: { ...voucher, expired } });
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

  const { data: voucher } = await supabaseAdmin
    .from('gift_vouchers')
    .select('id, status, amount, expires_at')
    .eq('restaurant_id', guard.restaurantId)
    .eq('code', parsed.data.code)
    .maybeSingle();

  if (!voucher) return NextResponse.json({ error: 'Bon introuvable.' }, { status: 404 });
  if (voucher.status === 'redeemed') return NextResponse.json({ error: 'Ce bon a déjà été utilisé.' }, { status: 409 });
  if (voucher.status !== 'active') return NextResponse.json({ error: 'Ce bon n\'est pas valide.' }, { status: 400 });
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Ce bon a expiré.' }, { status: 400 });
  }

  const { data: updated } = await supabaseAdmin
    .from('gift_vouchers')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', voucher.id)
    .eq('status', 'active') // garde anti double-rachat concurrent
    .select('id')
    .maybeSingle();
  if (!updated) return NextResponse.json({ error: 'Ce bon a déjà été utilisé.' }, { status: 409 });

  auditLog({
    restaurantId: guard.restaurantId,
    actorId: guard.userId,
    action: 'gift_voucher_redeem',
    targetType: 'gift_voucher',
    targetId: voucher.id,
    metadata: { amount: voucher.amount },
  });

  return NextResponse.json({ success: true, amount: Number(voucher.amount) });
}
