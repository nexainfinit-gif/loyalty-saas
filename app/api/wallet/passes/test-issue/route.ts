export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

/*
 * GET /api/wallet/passes/test-issue
 *
 * Owner-only. Finds (or creates) a test Apple Wallet pass for the first
 * registered customer using the restaurant's default published template.
 *
 * Returns the pass record plus a ready-to-use pkpassUrl that can be opened
 * on an iPhone to trigger the native Wallet install flow.
 *
 * Idempotent: if the pass already exists it is reused, not duplicated.
 */
export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const restaurantId = guard.restaurantId;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  // ── 1. Find best available published template (prefer is_default=true) ──────
  const { data: templates } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, name, pass_kind, is_default')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'published')
    .order('is_default', { ascending: false })
    .limit(3);

  const template = templates?.[0] ?? null;

  if (!template) {
    return NextResponse.json({
      error: 'Aucun template publié. Créez un template dans Wallet Studio d\'abord.',
      hint:  '/dashboard/wallet → Nouveau template → publié',
    }, { status: 404 });
  }

  // ── 2. Get first customer of the restaurant ──────────────────────────────────
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({
      error: 'Aucun client enregistré. Inscrivez un premier client via la page publique.',
      hint:  '/register/[slug]',
    }, { status: 404 });
  }

  // ── 3. Reuse existing active pass, or create a new one ───────────────────────
  const { data: existing } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, issued_at')
    .eq('restaurant_id', restaurantId)
    .eq('customer_id',   customer.id)
    .eq('template_id',   template.id)
    .eq('platform',      'apple')
    .eq('status',        'active')
    .maybeSingle();

  let passId: string;
  let isNew = false;

  if (existing) {
    passId = existing.id;
  } else {
    const { data: created, error: insertErr } = await supabaseAdmin
      .from('wallet_passes')
      .insert({
        restaurant_id: restaurantId,
        customer_id:   customer.id,
        template_id:   template.id,
        platform:      'apple',
        status:        'active',
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[test-issue]', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    passId = created.id;
    isNew  = true;
  }

  const pkpassUrl = `${appUrl}/api/wallet/passes/${passId}/pkpass`;

  return NextResponse.json({
    passId,
    pkpassUrl,
    isNew,
    customer: {
      id:    customer.id,
      name:  `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
      email: customer.email,
    },
    template: {
      id:   template.id,
      name: template.name,
      kind: template.pass_kind,
    },
    instructions: [
      '1. Ouvrez pkpassUrl sur un iPhone (Safari).',
      '2. Safari affiche « Ajouter à Apple Wallet ».',
      '3. Le pass apparaît dans Wallet avec les données du client de test.',
    ],
  });
}
