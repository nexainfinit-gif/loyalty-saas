import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  const amount = Math.max(100, Math.min(100000, parseInt(body?.amount ?? '2900', 10)));

  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId requis.' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, stripe_customer_id, stripe_subscription_id, affiliate_id')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }
  if (!restaurant.stripe_customer_id) {
    return NextResponse.json({ error: 'Pas de client Stripe lié.' }, { status: 400 });
  }
  if (!restaurant.affiliate_id) {
    return NextResponse.json({ error: 'Pas d\'affilié lié à ce restaurant.' }, { status: 400 });
  }

  try {
    await stripe.invoiceItems.create({
      customer: restaurant.stripe_customer_id,
      amount,
      currency: 'eur',
      description: `[TEST] Facturation fictive — ${restaurant.name}`,
    });

    const invoice = await stripe.invoices.create({
      customer: restaurant.stripe_customer_id,
      auto_advance: false,
      metadata: { restaurantId: restaurant.id, test: 'true' },
    });

    await stripe.invoices.finalizeInvoice(invoice.id);
    const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });

    return NextResponse.json({
      ok: true,
      invoice_id: paid.id,
      amount_paid: paid.amount_paid,
      status: paid.status,
      message: `Facture test de ${(amount / 100).toFixed(2)}€ créée et payée. Le webhook invoice.paid devrait déclencher la commission.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur Stripe inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
