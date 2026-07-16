import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Diagnostic passes Wallet — TEMPORAIRE. Renvoie les passes d'un client (par
 * email) + l'URL Apple reconstruite, pour diagnostiquer « Pass introuvable ».
 * Protégé par ?secret=<CRON_SECRET>. À SUPPRIMER après diagnostic.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé (ajoutez ?secret=<CRON_SECRET>).' }, { status: 401 });
  }
  const email = url.searchParams.get('email')?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email requis (&email=...).' }, { status: 400 });

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, email, restaurant_id, qr_token, total_points, stamps_count, created_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!customer) return NextResponse.json({ found: false, message: 'Aucun client avec cet email.' });

  const { data: passes } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, platform, status, pass_kind, template_id, authentication_token, object_id, short_code, sync_error, created_at')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  const applePass = (passes ?? []).find((p) => p.platform === 'apple' && p.status === 'active');

  return NextResponse.json({
    customer: {
      id: customer.id, email: customer.email,
      stamps_count: customer.stamps_count, total_points: customer.total_points,
    },
    appUrlEnv: appUrl,
    passCount: passes?.length ?? 0,
    passes: (passes ?? []).map((p) => ({
      id: p.id,
      platform: p.platform,
      status: p.status,
      pass_kind: p.pass_kind,
      hasTemplate: !!p.template_id,
      hasAuthToken: !!p.authentication_token,
      objectId: p.object_id ? 'set' : null,
      syncError: p.sync_error,
    })),
    // URL exacte que l'email Apple aurait générée — à comparer avec le lien cliqué
    appleWalletUrl: applePass
      ? `${appUrl}/api/wallet/passes/${applePass.id}/pkpass?token=${applePass.authentication_token ?? ''}`
      : null,
  });
}
