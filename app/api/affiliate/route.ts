import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'affiliate-portal', limit: 30, windowMs: 60_000 });

export async function GET(req: NextRequest) {
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const code = (req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase();
  if (!code || code.length < 4) {
    return NextResponse.json({ error: 'Code requis.' }, { status: 400 });
  }

  const { data: affiliate } = await supabaseAdmin
    .from('affiliates')
    .select('id, name, code, commission_rate, status, created_at')
    .eq('code', code)
    .maybeSingle();

  if (!affiliate) {
    return NextResponse.json({ error: 'Code affilié introuvable.' }, { status: 404 });
  }

  const { data: referrals } = await supabaseAdmin
    .from('restaurants')
    .select('name, plan, subscription_status, created_at')
    .eq('affiliate_id', affiliate.id)
    .order('created_at', { ascending: false });

  const { data: commissions } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('commission_amount, status, created_at, paid_at')
    .eq('affiliate_id', affiliate.id)
    .order('created_at', { ascending: false });

  const comms = commissions ?? [];
  const totalPending = comms.filter(c => c.status === 'pending').reduce((s, c) => s + c.commission_amount, 0);
  const totalPaid = comms.filter(c => c.status === 'paid').reduce((s, c) => s + c.commission_amount, 0);

  return NextResponse.json({
    affiliate: {
      name: affiliate.name,
      code: affiliate.code,
      commission_rate: affiliate.commission_rate,
      status: affiliate.status,
      created_at: affiliate.created_at,
    },
    referrals: (referrals ?? []).map(r => ({
      name: r.name,
      plan: r.plan,
      subscription_status: r.subscription_status,
      created_at: r.created_at,
    })),
    commissions: comms.map(c => ({
      amount: c.commission_amount,
      status: c.status,
      created_at: c.created_at,
      paid_at: c.paid_at,
    })),
    summary: { total_pending: totalPending, total_paid: totalPaid, total_referrals: (referrals ?? []).length },
  });
}
