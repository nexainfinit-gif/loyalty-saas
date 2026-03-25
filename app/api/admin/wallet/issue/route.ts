import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import { issueGooglePass } from '@/lib/google-wallet';
import { randomUUID } from 'crypto';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── POST /api/admin/wallet/issue ────────────────────────────────────────── */

/**
 * Admin-only test card issuance.
 * Unlike /api/wallet/passes/issue (bound to guard.restaurantId),
 * this route accepts an explicit restaurantId and can look up customers by email.
 */

interface IssueBody {
  restaurantId: string;
  templateId:   string;
  platform:     'apple' | 'google';
  customerId?:  string;
  email?:       string;
}

export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  let body: Partial<IssueBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 });
  }

  const { restaurantId, templateId, platform, customerId, email } = body;

  if (!restaurantId) return NextResponse.json({ error: 'restaurantId requis.' }, { status: 400 });
  if (!templateId)   return NextResponse.json({ error: 'templateId requis.' },   { status: 400 });
  if (!platform || !['apple', 'google'].includes(platform)) {
    return NextResponse.json({ error: 'platform doit être "apple" ou "google".' }, { status: 400 });
  }
  if (!customerId && !email) {
    return NextResponse.json({ error: 'customerId ou email requis.' }, { status: 400 });
  }

  // ── Resolve customer ──────────────────────────────────────────────────────
  let resolvedCustomerId = customerId;

  if (!resolvedCustomerId && email) {
    const { data: found } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (!found) {
      return NextResponse.json(
        { error: `Aucun client avec l'email "${email}" pour ce restaurant.` },
        { status: 404 },
      );
    }
    resolvedCustomerId = found.id;
  }

  // ── Fetch full customer ───────────────────────────────────────────────────
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email, qr_token, stamps_count, total_points')
    .eq('id', resolvedCustomerId!)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: 'Client introuvable ou accès refusé.' }, { status: 404 });
  }

  // ── Validate template ─────────────────────────────────────────────────────
  // Draft templates have restaurant_id = NULL — match by ID only,
  // then verify it belongs to the target restaurant OR is a global draft.
  const { data: template } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, status, is_repeatable, valid_from, valid_to, pass_kind, config_json, primary_color, restaurant_id')
    .eq('id', templateId)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ error: 'Template introuvable.' }, { status: 404 });
  }
  if (template.restaurant_id && template.restaurant_id !== restaurantId) {
    return NextResponse.json({ error: 'Ce template appartient à un autre restaurant.' }, { status: 403 });
  }
  if (template.status === 'archived') {
    return NextResponse.json(
      { error: 'Ce template est archivé et ne peut pas être émis.' },
      { status: 409 },
    );
  }

  const now = new Date();
  if (template.valid_from && new Date(template.valid_from) > now) {
    return NextResponse.json({ error: 'Ce template n\'est pas encore valide.' }, { status: 409 });
  }
  if (template.valid_to && new Date(template.valid_to) < now) {
    return NextResponse.json({ error: 'Ce template a expiré.' }, { status: 409 });
  }

  // ── Check existing active pass (non-repeatable) ───────────────────────────
  if (!template.is_repeatable) {
    const { data: existing } = await supabaseAdmin
      .from('wallet_passes')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('customer_id', resolvedCustomerId!)
      .eq('template_id', templateId)
      .eq('platform', platform)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Ce client possède déjà un pass actif pour ce template.', passId: existing.id },
        { status: 409 },
      );
    }
  }

  const expiresAt = template.valid_to ?? null;

  // ── Fetch restaurant info (needed for both platforms + email) ────────────
  const { data: restaurantInfo } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, logo_url')
    .eq('id', restaurantId)
    .single();

  const restaurantName = restaurantInfo?.name ?? 'Restaurant';

  // ── Google Wallet ─────────────────────────────────────────────────────────
  if (platform === 'google') {
    const [restaurantRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from('restaurants')
        .select('id, name, primary_color, logo_url')
        .eq('id', restaurantId)
        .single(),
      supabaseAdmin
        .from('loyalty_settings')
        .select('stamps_total, reward_threshold, reward_message, points_per_scan, program_type')
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),
    ]);

    const restaurant      = restaurantRes.data;
    const loyaltySettings = settingsRes.data;

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
    }

    const resolvedConfig: Record<string, unknown> = {
      ...((template.config_json as Record<string, unknown>) ?? {}),
      ...(loyaltySettings ? {
        program_type:     loyaltySettings.program_type,
        stamps_total:     loyaltySettings.stamps_total,
        reward_threshold: loyaltySettings.reward_threshold,
        reward_message:   loyaltySettings.reward_message,
        points_per_scan:  loyaltySettings.points_per_scan,
      } : {}),
    };

    const passId    = randomUUID();
    const shortCode = passId.replace(/-/g, '').slice(0, 8).toUpperCase();

    const { saveUrl, objectId, synced } = await issueGooglePass({
      passId,
      restaurantId,
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
      passKind:       template.pass_kind as 'stamps' | 'points' | 'event',
      configJson:     resolvedConfig,
    });

    const { data: newPass, error: insertErr } = await supabaseAdmin
      .from('wallet_passes')
      .insert({
        id:             passId,
        short_code:     shortCode,
        restaurant_id:  restaurantId,
        customer_id:    resolvedCustomerId!,
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
          { error: 'Conflit concurrent — un pass actif existe déjà.' },
          { status: 409 },
        );
      }
      console.error('[admin/wallet/issue google]', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Send notification email (fire-and-forget)
    sendPassEmail({
      to: (customer as { email?: string }).email ?? '',
      firstName: customer.first_name ?? '',
      restaurantName,
      platform: 'google',
      walletUrl: saveUrl,
    }).catch(err => console.error('[admin/wallet/issue] email error:', err));

    return NextResponse.json({ pass: newPass, saveUrl }, { status: 201 });
  }

  // ── Apple Wallet ──────────────────────────────────────────────────────────
  const applePassId    = randomUUID();
  const appleShortCode = applePassId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const appleAuthToken = randomUUID().replace(/-/g, '');

  const { data: newPass, error: insertErr } = await supabaseAdmin
    .from('wallet_passes')
    .insert({
      id:                   applePassId,
      short_code:           appleShortCode,
      restaurant_id:        restaurantId,
      customer_id:          resolvedCustomerId!,
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
        { error: 'Conflit concurrent — un pass actif existe déjà.' },
        { status: 409 },
      );
    }
    console.error('[admin/wallet/issue apple]', insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.rebites.be';
  const pkpassUrl = `${appUrl}/api/wallet/passes/${applePassId}/pkpass?token=${appleAuthToken}`;

  // Send notification email (fire-and-forget)
  sendPassEmail({
    to: (customer as { email?: string }).email ?? '',
    firstName: customer.first_name ?? '',
    restaurantName,
    platform: 'apple',
    walletUrl: pkpassUrl,
  }).catch(err => console.error('[admin/wallet/issue] email error:', err));

  return NextResponse.json({ pass: newPass }, { status: 201 });
}

/* ── Email helper ──────────────────────────────────────────────────────────── */

async function sendPassEmail(opts: {
  to: string;
  firstName: string;
  restaurantName: string;
  platform: 'apple' | 'google';
  walletUrl: string;
}) {
  if (!opts.to || !process.env.RESEND_API_KEY) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const platformLabel = opts.platform === 'apple' ? 'Apple Wallet' : 'Google Wallet';

  await resend.emails.send({
    from: `${opts.restaurantName} <noreply@rebites.be>`,
    to: opts.to,
    subject: `Votre carte ${platformLabel} – ${opts.restaurantName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a;font-size:20px;margin-bottom:8px">Bonjour ${opts.firstName.replace(/</g, '&lt;')} 👋</h2>
        <p style="color:#555;font-size:15px;line-height:1.6">
          Votre carte de fidélité <strong>${opts.restaurantName.replace(/</g, '&lt;')}</strong> est prête !
        </p>
        <div style="text-align:center;margin:24px 0">
          <a href="${opts.walletUrl}" style="display:inline-block;background:#000;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px">
            Ajouter à ${platformLabel}
          </a>
        </div>
        <p style="color:#999;font-size:12px;text-align:center">
          Présentez votre carte à chaque visite pour cumuler vos récompenses.
        </p>
      </div>
    `,
  });
}
