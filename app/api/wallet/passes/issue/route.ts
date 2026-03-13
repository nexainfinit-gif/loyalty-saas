import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import { issueGooglePass } from '@/lib/google-wallet';
import { randomUUID } from 'crypto';

/* ── Types ────────────────────────────────────────────────────────────────── */

type Platform = 'apple' | 'google';

interface IssueBody {
  customerId:  string;
  templateId:  string;
  platform:    Platform;
}

/* ── Route ────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  // ── Auth: platform owner only ─────────────────────────────────────────────
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Partial<IssueBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 });
  }

  const { customerId, templateId, platform } = body;

  if (!customerId)  return NextResponse.json({ error: 'customerId manquant.' },  { status: 400 });
  if (!templateId)  return NextResponse.json({ error: 'templateId manquant.' },  { status: 400 });
  if (!platform || !['apple', 'google'].includes(platform)) {
    return NextResponse.json({ error: 'platform doit être "apple" ou "google".' }, { status: 400 });
  }

  // ── Validate template belongs to this restaurant and is published ──────────
  const { data: template } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, status, is_repeatable, valid_from, valid_to, pass_kind, config_json, primary_color')
    .eq('id', templateId)
    .eq('restaurant_id', guard.restaurantId)
    .single();

  if (!template) {
    return NextResponse.json({ error: 'Template introuvable ou accès refusé.' }, { status: 404 });
  }
  if (template.status !== 'published') {
    return NextResponse.json(
      { error: `Ce template est "${template.status}" et ne peut pas être émis.` },
      { status: 409 },
    );
  }

  // ── Validate validity window ───────────────────────────────────────────────
  const now = new Date();
  if (template.valid_from && new Date(template.valid_from) > now) {
    return NextResponse.json({ error: 'Ce template n\'est pas encore valide.' }, { status: 409 });
  }
  if (template.valid_to && new Date(template.valid_to) < now) {
    return NextResponse.json({ error: 'Ce template a expiré.' }, { status: 409 });
  }

  // ── Validate customer belongs to this restaurant (ownership check only) ─────
  const { data: customerOwnership, error: ownershipErr } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('restaurant_id', guard.restaurantId)
    .single();

  if (ownershipErr || !customerOwnership) {
    console.error('[wallet/passes/issue] customer ownership check failed:', ownershipErr);
    return NextResponse.json({ error: 'Client introuvable ou accès refusé.' }, { status: 404 });
  }

  // ── Fetch full customer data for pass issuance ────────────────────────────
  const { data: customer, error: customerErr } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, qr_token, stamps_count, total_points')
    .eq('id', customerId)
    .single();

  if (customerErr || !customer) {
    console.error('[wallet/passes/issue] customer data fetch failed:', customerErr);
    return NextResponse.json(
      { error: customerErr?.message ?? 'Erreur lors de la récupération du client.' },
      { status: 500 },
    );
  }

  // ── Check for existing active pass (non-repeatable templates only) ─────────
  if (!template.is_repeatable) {
    const { data: existing } = await supabaseAdmin
      .from('wallet_passes')
      .select('id')
      .eq('restaurant_id', guard.restaurantId)
      .eq('customer_id',   customerId)
      .eq('template_id',   templateId)
      .eq('platform',      platform)
      .eq('status',        'active')
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Ce client possède déjà un pass actif pour ce template.', passId: existing.id },
        { status: 409 },
      );
    }
  }

  // ── Compute expires_at from template validity window ───────────────────────
  const expiresAt = template.valid_to ?? null;

  // ── Google Wallet: call REST API, store object_id ─────────────────────────
  if (platform === 'google') {
    const [restaurantRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from('restaurants')
        .select('id, name, primary_color, logo_url')
        .eq('id', guard.restaurantId)
        .single(),
      supabaseAdmin
        .from('loyalty_settings')
        .select('stamps_total, reward_threshold, reward_message, points_per_scan, program_type')
        .eq('restaurant_id', guard.restaurantId)
        .maybeSingle(),
    ]);

    const restaurant     = restaurantRes.data;
    const loyaltySettings = settingsRes.data;

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
    }

    // Merge: loyalty_settings is the single source of truth for all loyalty logic.
    // config_json may carry visual overrides (primary_color, logo hints) but must
    // never win on program_type, stamps_total, points_per_scan, or reward thresholds —
    // those drive scan behavior and must stay in sync with the scan route.
    const resolvedConfig: Record<string, unknown> = {
      ...((template.config_json as Record<string, unknown>) ?? {}),
      ...(loyaltySettings ? {
        program_type:     loyaltySettings.program_type,   // ← prevents config_json divergence
        stamps_total:     loyaltySettings.stamps_total,
        reward_threshold: loyaltySettings.reward_threshold,
        reward_message:   loyaltySettings.reward_message,
        points_per_scan:  loyaltySettings.points_per_scan,
      } : {}),
    };

    // passKind: loyalty_settings.program_type is the source of truth — ensures
    // the card type (stamps vs points) always matches the active program.
    const effectivePassKind = (loyaltySettings?.program_type === 'stamps' ? 'stamps' : 'points') as 'stamps' | 'points';

    const passId    = randomUUID();
    const shortCode = passId.replace(/-/g, '').slice(0, 8).toUpperCase();

    const { saveUrl, objectId, synced } = await issueGooglePass({
      passId,
      restaurantId:   guard.restaurantId,
      customerId:     customer.id,
      firstName:      customer.first_name  ?? '',
      lastName:       customer.last_name   ?? '',
      totalPoints:    customer.total_points ?? 0,
      stampsCount:    customer.stamps_count ?? 0,
      qrToken:        customer.qr_token    ?? customer.id,
      shortCode,
      restaurantName: restaurant.name,
      primaryColor:   template.primary_color ?? restaurant.primary_color ?? '#4f6bed',
      logoUrl:        restaurant.logo_url,
      passKind:       effectivePassKind,
      configJson:     resolvedConfig,
    });

    const { data: newPass, error: insertErr } = await supabaseAdmin
      .from('wallet_passes')
      .insert({
        id:             passId,
        short_code:     shortCode,
        restaurant_id:  guard.restaurantId,
        customer_id:    customerId,
        template_id:    templateId,
        platform:       'google',
        status:         'active',
        expires_at:     expiresAt,
        object_id:      objectId,
        last_synced_at: synced ? new Date().toISOString() : null,
        sync_error:     synced ? null : 'Initial sync failed',
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return NextResponse.json(
          { error: 'Un pass actif existe déjà pour ce slot (conflit concurrent).' },
          { status: 409 },
        );
      }
      console.error('[wallet/passes/issue google]', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ pass: newPass, saveUrl }, { status: 201 });
  }

  // ── Apple Wallet: insert DB row only (pkpass generated on download) ────────
  const applePassId    = randomUUID();
  const appleShortCode = applePassId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const appleAuthToken = randomUUID().replace(/-/g, ''); // 32 hex chars (>16 char Apple minimum)

  const { data: newPass, error: insertErr } = await supabaseAdmin
    .from('wallet_passes')
    .insert({
      id:                   applePassId,
      short_code:           appleShortCode,
      restaurant_id:        guard.restaurantId,
      customer_id:          customerId,
      template_id:          templateId,
      platform:             'apple',
      status:               'active',
      expires_at:           expiresAt,
      authentication_token: appleAuthToken,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json(
        { error: 'Un pass actif existe déjà pour ce slot (conflit concurrent).' },
        { status: 409 },
      );
    }
    console.error('[wallet/passes/issue apple]', insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ pass: newPass }, { status: 201 });
}
