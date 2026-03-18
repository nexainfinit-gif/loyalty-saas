import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { autoIssueApplePass } from '@/lib/wallet-auto-issue';
import { issueGooglePass } from '@/lib/google-wallet';
import { detectDevice } from '@/lib/detect-device';
import type { DeviceType } from '@/lib/detect-device';
import { randomUUID } from 'crypto';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'verify-email', limit: 15, windowMs: 60_000 });

interface WalletUrls {
  apple: string | null;
  google: string | null;
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.success) {
    return new NextResponse(errorHtml('Trop de requêtes', 'Veuillez réessayer dans quelques minutes.'), {
      status: 429,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const token = req.nextUrl.searchParams.get('token');
  const device = detectDevice(req.headers.get('user-agent') ?? '');

  if (!token) {
    return new NextResponse(errorHtml('Lien invalide', 'Le lien de vérification est invalide ou incomplet.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Find customer with this verification token
  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email_verified, restaurant_id, qr_token, total_points, stamps_count')
    .eq('email_verification_token', token)
    .single();

  if (error || !customer) {
    return new NextResponse(errorHtml('Lien expiré', 'Ce lien de vérification est invalide ou a déjà été utilisé.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (customer.email_verified) {
    const walletUrls = await getWalletUrls(customer);
    return new NextResponse(successHtml(customer.first_name, true, walletUrls, device), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Mark as verified and clear token
  const { error: updateError } = await supabaseAdmin
    .from('customers')
    .update({
      email_verified: true,
      email_verification_token: null,
    })
    .eq('id', customer.id);

  if (updateError) {
    return new NextResponse(errorHtml('Erreur', 'Une erreur est survenue. Veuillez réessayer.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Issue wallet passes now that email is confirmed
  const walletUrls = await getWalletUrls(customer);

  return new NextResponse(successHtml(customer.first_name, false, walletUrls, device), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/* ── Wallet URL helpers ──────────────────────────────────────────────── */

async function getWalletUrls(customer: {
  id: string;
  first_name: string;
  last_name: string | null;
  restaurant_id: string;
  qr_token: string | null;
  total_points: number | null;
  stamps_count: number | null;
}): Promise<WalletUrls> {
  const [apple, google] = await Promise.all([
    getAppleWalletUrl(customer.restaurant_id, customer.id),
    getGoogleWalletUrl(customer),
  ]);
  return { apple, google };
}

async function getAppleWalletUrl(restaurantId: string, customerId: string): Promise<string | null> {
  // Check for existing Apple pass
  const { data: existingPass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .eq('platform', 'apple')
    .eq('status', 'active')
    .maybeSingle();

  if (existingPass) {
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${existingPass.id}/pkpass`;
  }

  // Issue new pass
  const applePassId = await autoIssueApplePass({ restaurantId, customerId });
  if (applePassId) {
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${applePassId}/pkpass`;
  }
  return null;
}

async function getGoogleWalletUrl(customer: {
  id: string;
  first_name: string;
  last_name: string | null;
  restaurant_id: string;
  qr_token: string | null;
  total_points: number | null;
  stamps_count: number | null;
}): Promise<string | null> {
  try {
    // Check for existing Google pass
    const { data: existingPass } = await supabaseAdmin
      .from('wallet_passes')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('restaurant_id', customer.restaurant_id)
      .eq('platform', 'google')
      .eq('status', 'active')
      .maybeSingle();

    if (existingPass) {
      // Already has a Google pass — no need to re-issue
      return null;
    }

    // Fetch restaurant + loyalty settings + template
    const [restaurantRes, settingsRes, templateRes] = await Promise.all([
      supabaseAdmin
        .from('restaurants')
        .select('id, name, primary_color, logo_url')
        .eq('id', customer.restaurant_id)
        .single(),
      supabaseAdmin
        .from('loyalty_settings')
        .select('stamps_total, reward_threshold, reward_message, points_per_scan, program_type')
        .eq('restaurant_id', customer.restaurant_id)
        .maybeSingle(),
      supabaseAdmin
        .from('wallet_pass_templates')
        .select('id, primary_color, config_json')
        .eq('restaurant_id', customer.restaurant_id)
        .eq('status', 'published')
        .eq('is_default', true)
        .maybeSingle(),
    ]);

    const restaurant = restaurantRes.data;
    const settings = settingsRes.data;
    const template = templateRes.data;

    if (!restaurant || !template) return null;

    const effectivePassKind = (settings?.program_type === 'stamps' ? 'stamps' : 'points') as 'stamps' | 'points';

    const resolvedConfig: Record<string, unknown> = {
      ...((template.config_json as Record<string, unknown>) ?? {}),
      ...(settings ? {
        program_type: settings.program_type,
        stamps_total: settings.stamps_total,
        reward_threshold: settings.reward_threshold,
        reward_message: settings.reward_message,
        points_per_scan: settings.points_per_scan,
      } : {}),
    };

    const passId = randomUUID();
    const shortCode = passId.replace(/-/g, '').slice(0, 8).toUpperCase();

    const { saveUrl, objectId, synced } = await issueGooglePass({
      passId,
      restaurantId: customer.restaurant_id,
      customerId: customer.id,
      firstName: customer.first_name ?? '',
      lastName: customer.last_name ?? '',
      totalPoints: customer.total_points ?? 0,
      stampsCount: customer.stamps_count ?? 0,
      qrToken: customer.qr_token ?? customer.id,
      shortCode,
      restaurantName: restaurant.name,
      primaryColor: template.primary_color ?? restaurant.primary_color ?? '#4f6bed',
      logoUrl: restaurant.logo_url,
      passKind: effectivePassKind,
      configJson: resolvedConfig,
    });

    // Save to DB
    await supabaseAdmin
      .from('wallet_passes')
      .insert({
        id: passId,
        short_code: shortCode,
        restaurant_id: customer.restaurant_id,
        customer_id: customer.id,
        template_id: template.id,
        platform: 'google',
        status: 'active',
        object_id: objectId,
        last_synced_at: synced ? new Date().toISOString() : null,
        sync_error: synced ? null : 'Initial sync failed',
      });

    // Save wallet URL on customer
    await supabaseAdmin
      .from('customers')
      .update({ wallet_card_url: saveUrl })
      .eq('id', customer.id);

    return saveUrl;
  } catch (err) {
    console.error('[verify-email] Google Wallet issue failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/* ── HTML templates ──────────────────────────────────────────────────── */

/* ── Wallet button HTML fragments ────────────────────────────────────── */

const APPLE_SVG = '<svg width="18" height="22" viewBox="0 0 20 24" fill="white"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>';
const GOOGLE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';

function primaryBtn(href: string, label: string, icon: string, bg: string, target = ''): string {
  return `<a href="${href}" ${target ? `target="${target}" rel="noreferrer"` : ''} style="display:flex;align-items:center;justify-content:center;gap:0.5rem;background:${bg};color:white;text-decoration:none;padding:1rem;border-radius:14px;font-size:1rem;font-weight:700;">${icon} ${label}</a>`;
}

function secondaryLink(href: string, label: string, target = ''): string {
  return `<a href="${href}" ${target ? `target="${target}" rel="noreferrer"` : ''} style="display:block;text-align:center;color:#6b7280;font-size:0.8rem;text-decoration:underline;margin-top:0.75rem;">${label}</a>`;
}

function successHtml(firstName: string, alreadyVerified: boolean, walletUrls: WalletUrls, device: DeviceType): string {
  const safeName = firstName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const message = alreadyVerified
    ? 'Votre adresse email a déjà été vérifiée.'
    : 'Votre adresse email a été vérifiée avec succès !';

  const hasWallet = walletUrls.apple || walletUrls.google;

  let walletContent = '';

  if (hasWallet) {
    if (device === 'ios' && walletUrls.apple) {
      // iOS → Apple primary, Google secondary
      walletContent = primaryBtn(walletUrls.apple, 'Ajouter à Apple Wallet', APPLE_SVG, '#000');
      if (walletUrls.google) {
        walletContent += secondaryLink(walletUrls.google, 'Ou ajouter à Google Wallet', '_blank');
      }
    } else if (device === 'android' && walletUrls.google) {
      // Android → Google primary, Apple secondary
      walletContent = primaryBtn(walletUrls.google, 'Ajouter à Google Wallet', GOOGLE_SVG, '#1a73e8', '_blank');
      if (walletUrls.apple) {
        walletContent += secondaryLink(walletUrls.apple, 'Ou ajouter à Apple Wallet');
      }
    } else {
      // Desktop / unknown / single wallet available → show both equally
      if (walletUrls.apple) {
        walletContent += primaryBtn(walletUrls.apple, 'Ajouter à Apple Wallet', APPLE_SVG, '#000');
      }
      if (walletUrls.google) {
        walletContent += `<div style="margin-top:${walletUrls.apple ? '0.75rem' : '0'}">` +
          primaryBtn(walletUrls.google, 'Ajouter à Google Wallet', GOOGLE_SVG, '#1a73e8', '_blank') +
          '</div>';
      }
    }
  }

  const walletSection = hasWallet ? `
    <div style="background:#f8f9fa;border-radius:16px;padding:1.25rem;margin-top:1.5rem;border:1.5px solid #e5e7eb;">
      <p style="font-size:0.9rem;font-weight:700;color:#111;margin:0 0 1rem;">📱 Votre carte fidélité</p>
      ${walletContent}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email vérifié</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}
    .card{background:white;border-radius:24px;padding:2.5rem;max-width:400px;width:100%;box-shadow:0 4px 40px rgba(0,0,0,.08);text-align:center}
    .icon{width:64px;height:64px;background:#ecfdf5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;font-size:2rem}
    h1{font-size:1.5rem;color:#111;margin:0 0 .5rem}
    p{color:#555;font-size:.95rem;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h1>Bonjour ${safeName} !</h1>
    <p>${message}</p>
    ${walletSection}
  </div>
</body>
</html>`;
}

function errorHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: white; border-radius: 24px; padding: 2.5rem; max-width: 400px; width: 100%; box-shadow: 0 4px 40px rgba(0,0,0,0.08); text-align: center; }
    .icon { width: 64px; height: 64px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; font-size: 2rem; }
    h1 { font-size: 1.5rem; color: #111; margin: 0 0 0.5rem; }
    p { color: #555; font-size: 0.95rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
