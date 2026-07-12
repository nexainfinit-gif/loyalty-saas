import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'affiliate-connect', limit: 10, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const code = (body?.code ?? '').trim().toUpperCase();
  if (!code) return NextResponse.json({ error: 'Code requis.' }, { status: 400 });

  const { data: affiliate } = await supabaseAdmin
    .from('affiliates')
    .select('id, name, email, stripe_account_id, status')
    .eq('code', code)
    .eq('status', 'active')
    .maybeSingle();

  if (!affiliate) {
    return NextResponse.json({ error: 'Affilié introuvable ou inactif.' }, { status: 404 });
  }

  let accountId = affiliate.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'BE',
      email: affiliate.email,
      business_profile: { name: affiliate.name },
      capabilities: { transfers: { requested: true } },
      metadata: { affiliate_id: affiliate.id },
    });
    accountId = account.id;

    const { error: updErr } = await supabaseAdmin
      .from('affiliates')
      .update({ stripe_account_id: accountId })
      .eq('id', affiliate.id);

    if (updErr) {
      await stripe.accounts.del(accountId).catch(() => {});
      return NextResponse.json({ error: 'Erreur lors de l\'enregistrement.' }, { status: 500 });
    }
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.rebites.be';
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/fr/affiliate?code=${code}&connect=refresh`,
    return_url: `${appUrl}/fr/affiliate?code=${code}&connect=done`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: link.url });
}

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase();
  if (!code) return NextResponse.json({ error: 'Code requis.' }, { status: 400 });

  const { data: affiliate } = await supabaseAdmin
    .from('affiliates')
    .select('stripe_account_id')
    .eq('code', code)
    .eq('status', 'active')
    .maybeSingle();

  if (!affiliate?.stripe_account_id) {
    return NextResponse.json({ connected: false, chargesEnabled: false });
  }

  const account = await stripe.accounts.retrieve(affiliate.stripe_account_id);
  return NextResponse.json({
    connected: true,
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    payoutsEnabled: account.payouts_enabled === true,
  });
}
