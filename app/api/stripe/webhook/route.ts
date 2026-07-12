import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events. Verifies signature, then updates DB.
 * No auth — Stripe signs the payload.
 */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event type — acknowledge silently
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`[stripe-webhook] Error handling ${event.type}:`, message, stack);
    return NextResponse.json({ error: 'Webhook handler error.', detail: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/* ── Event Handlers ─────────────────────────────────────────────────────── */

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Achat de crédits de rappels (paiement unique) — pas un abonnement.
  if (session.metadata?.type === 'reminder_credits') {
    await handleReminderCreditsPurchase(session);
    return;
  }

  const restaurantId = session.metadata?.restaurantId;
  const planId = session.metadata?.planId;
  const planKey = session.metadata?.planKey;

  if (!restaurantId || !planId) {
    console.error('[stripe-webhook] checkout.session.completed missing metadata');
    return;
  }

  // Retrieve the subscription to get period_end
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.error('[stripe-webhook] checkout.session.completed missing subscription');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;

  await supabaseAdmin
    .from('restaurants')
    .update({
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      current_period_end: toISO((subscription as unknown as Record<string, unknown>).current_period_end),
      plan_id: planId,
      plan: planKey ?? 'pro',
    })
    .eq('id', restaurantId);
}

async function handleReminderCreditsPurchase(session: Stripe.Checkout.Session) {
  const restaurantId = session.metadata?.restaurantId;
  const credits = parseInt(session.metadata?.credits ?? '', 10);
  if (!restaurantId || !Number.isFinite(credits) || credits <= 0) {
    console.error('[stripe-webhook] reminder_credits: missing/invalid metadata');
    return;
  }
  if (session.payment_status !== 'paid') return;

  // Solde courant + nouveau solde.
  const { data: r } = await supabaseAdmin
    .from('restaurants')
    .select('reminder_credits')
    .eq('id', restaurantId)
    .single();
  const newBalance = ((r?.reminder_credits as number) ?? 0) + credits;

  // Idempotence : l'index unique sur stripe_checkout_session_id rejette un
  // second webhook pour la même session (23505) → on n'ajoute pas deux fois.
  const { error: ledgerErr } = await supabaseAdmin
    .from('reminder_credit_ledger')
    .insert({
      restaurant_id: restaurantId,
      delta: credits,
      reason: 'purchase',
      balance_after: newBalance,
      stripe_checkout_session_id: session.id,
    });

  if (ledgerErr) {
    if (ledgerErr.code === '23505') return; // déjà traité — ne pas recréditer
    console.error('[stripe-webhook] reminder_credits ledger error:', ledgerErr.message);
    return;
  }

  await supabaseAdmin
    .from('restaurants')
    .update({ reminder_credits: newBalance })
    .eq('id', restaurantId);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const restaurantId = subscription.metadata?.restaurantId;

  if (!restaurantId) {
    // Fallback: find restaurant by stripe_subscription_id
    const { data: restaurant } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();

    if (!restaurant) {
      console.error('[stripe-webhook] subscription.updated: restaurant not found for', subscription.id);
      return;
    }

    await updateSubscriptionFields(restaurant.id, subscription);
    return;
  }

  await updateSubscriptionFields(restaurantId, subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const restaurantId = subscription.metadata?.restaurantId;

  // Find restaurant by metadata or subscription ID
  let targetId = restaurantId;
  if (!targetId) {
    const { data: restaurant } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    targetId = restaurant?.id;
  }

  if (!targetId) {
    console.error('[stripe-webhook] subscription.deleted: restaurant not found');
    return;
  }

  // Downgrade to starter (free-tier) plan
  const { data: starterPlan } = await supabaseAdmin
    .from('plans')
    .select('id, key')
    .eq('key', 'starter')
    .maybeSingle();

  await supabaseAdmin
    .from('restaurants')
    .update({
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      current_period_end: null,
      plan: starterPlan?.key ?? 'starter',
      plan_id: starterPlan?.id ?? null,
    })
    .eq('id', targetId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const sub = (invoice as unknown as { subscription: string | { id: string } | null }).subscription;
  const subscriptionId =
    typeof sub === 'string'
      ? sub
      : sub?.id;

  if (!subscriptionId) return;

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!restaurant) return;

  await supabaseAdmin
    .from('restaurants')
    .update({ subscription_status: 'past_due' })
    .eq('id', restaurant.id);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const sub = (invoice as unknown as { subscription: string | { id: string } | null }).subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id;
  if (!subscriptionId) return;

  const amountPaid = (invoice as unknown as { amount_paid: number }).amount_paid;
  if (!amountPaid || amountPaid <= 0) return;

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, affiliate_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (!restaurant?.affiliate_id) return;

  const { data: affiliate } = await supabaseAdmin
    .from('affiliates')
    .select('id, commission_rate, status')
    .eq('id', restaurant.affiliate_id)
    .single();
  if (!affiliate || affiliate.status !== 'active') return;

  const commissionAmount = Math.round(amountPaid * Number(affiliate.commission_rate) / 100);
  if (commissionAmount <= 0) return;

  await supabaseAdmin
    .from('affiliate_commissions')
    .upsert({
      affiliate_id: affiliate.id,
      restaurant_id: restaurant.id,
      stripe_invoice_id: invoice.id,
      invoice_amount: amountPaid,
      commission_amount: commissionAmount,
      commission_rate: affiliate.commission_rate,
      status: 'pending',
    }, { onConflict: 'stripe_invoice_id,affiliate_id' });
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Convert Stripe timestamp (unix seconds) or ISO string to ISO string */
function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return null;
}

async function updateSubscriptionFields(
  restaurantId: string,
  subscription: Stripe.Subscription,
) {
  const planId = subscription.metadata?.planId;
  const planKey = subscription.metadata?.planKey;

  const update: Record<string, unknown> = {
    subscription_status: subscription.status,
    current_period_end: toISO((subscription as unknown as Record<string, unknown>).current_period_end),
  };

  if (planId) update.plan_id = planId;
  if (planKey) update.plan = planKey;

  await supabaseAdmin
    .from('restaurants')
    .update(update)
    .eq('id', restaurantId);
}
