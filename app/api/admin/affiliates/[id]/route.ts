import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  const { data: affiliate } = await supabaseAdmin
    .from('affiliates')
    .select('*')
    .eq('id', id)
    .single();

  if (!affiliate) return NextResponse.json({ error: 'Affilié introuvable.' }, { status: 404 });

  const { data: referrals } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, plan, subscription_status, created_at')
    .eq('affiliate_id', id)
    .order('created_at', { ascending: false });

  const { data: commissions } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('*')
    .eq('affiliate_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ affiliate, referrals: referrals ?? [], commissions: commissions ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body?.action === 'mark_paid') {
    const commissionIds: string[] = body.commissionIds;
    if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
      return NextResponse.json({ error: 'commissionIds requis.' }, { status: 400 });
    }

    const { data: affiliate } = await supabaseAdmin
      .from('affiliates')
      .select('stripe_account_id')
      .eq('id', id)
      .single();

    const { data: commissions } = await supabaseAdmin
      .from('affiliate_commissions')
      .select('id, commission_amount')
      .in('id', commissionIds)
      .eq('affiliate_id', id)
      .eq('status', 'pending');

    if (!commissions || commissions.length === 0) {
      return NextResponse.json({ error: 'Aucune commission en attente.' }, { status: 400 });
    }

    const totalCents = commissions.reduce((s, c) => s + c.commission_amount, 0);

    if (affiliate?.stripe_account_id && totalCents >= 100) {
      try {
        const account = await stripe.accounts.retrieve(affiliate.stripe_account_id);
        if (!account.payouts_enabled) {
          return NextResponse.json({ error: 'Le compte Stripe de l\'affilié n\'est pas encore prêt pour les virements.' }, { status: 400 });
        }

        const transfer = await stripe.transfers.create({
          amount: totalCents,
          currency: 'eur',
          destination: affiliate.stripe_account_id,
          description: `Commission affilié — ${commissions.length} facture(s)`,
          metadata: { affiliate_id: id, commission_ids: commissionIds.join(',') },
        });

        await supabaseAdmin
          .from('affiliate_commissions')
          .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_transfer_id: transfer.id })
          .in('id', commissionIds)
          .eq('affiliate_id', id)
          .eq('status', 'pending');

        return NextResponse.json({ ok: true, paid: commissions.length, transfer_id: transfer.id, amount: totalCents });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur Stripe';
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    const { error } = await supabaseAdmin
      .from('affiliate_commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .in('id', commissionIds)
      .eq('affiliate_id', id)
      .eq('status', 'pending');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, paid: commissions.length, manual: true });
  }

  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
