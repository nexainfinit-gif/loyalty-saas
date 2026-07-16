import { supabaseAdmin } from '@/lib/supabase-admin';
import { autoIssueApplePass } from '@/lib/wallet-auto-issue';
import { issueGooglePass } from '@/lib/google-wallet';
import { randomUUID } from 'crypto';

/**
 * Émission des passes Wallet (Apple + Google) pour un client.
 * Extrait de /api/verify-email pour être réutilisé à l'inscription directe
 * (sans étape de confirmation d'email). Idempotent : réutilise un pass actif
 * existant. Best-effort : renvoie null par plateforme en cas d'échec.
 */

export interface WalletUrls {
  apple: string | null;
  google: string | null;
}

interface CustomerForWallet {
  id: string;
  first_name: string;
  last_name: string | null;
  restaurant_id: string;
  qr_token: string | null;
  total_points: number | null;
  stamps_count: number | null;
}

export async function issueWalletPasses(customer: CustomerForWallet): Promise<WalletUrls> {
  const [apple, google] = await Promise.all([
    getAppleWalletUrl(customer.restaurant_id, customer.id),
    getGoogleWalletUrl(customer),
  ]);
  return { apple, google };
}

async function getAppleWalletUrl(restaurantId: string, customerId: string): Promise<string | null> {
  const { data: existingPass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, authentication_token')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .eq('platform', 'apple')
    .eq('status', 'active')
    .maybeSingle();

  if (existingPass) {
    const tkn = (existingPass as { authentication_token?: string }).authentication_token ?? '';
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${existingPass.id}/pkpass?token=${tkn}`;
  }

  const appleResult = await autoIssueApplePass({ restaurantId, customerId });
  if (appleResult) {
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${appleResult.passId}/pkpass?token=${appleResult.token}`;
  }
  return null;
}

async function getGoogleWalletUrl(customer: CustomerForWallet): Promise<string | null> {
  try {
    const { data: existingPass } = await supabaseAdmin
      .from('wallet_passes')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('restaurant_id', customer.restaurant_id)
      .eq('platform', 'google')
      .eq('status', 'active')
      .maybeSingle();

    if (existingPass) return null;

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
        pass_kind: effectivePassKind,
        object_id: objectId,
        last_synced_at: synced ? new Date().toISOString() : null,
        sync_error: synced ? null : 'Initial sync failed',
      });

    await supabaseAdmin
      .from('customers')
      .update({ wallet_card_url: saveUrl })
      .eq('id', customer.id);

    return saveUrl;
  } catch (err) {
    console.error('[wallet-issue] Google Wallet issue failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
