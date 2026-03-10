import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { sendWelcomeEmail } from '@/lib/email';
import { generateWalletUrl } from '@/lib/google-wallet';
import { autoIssueApplePass } from '@/lib/wallet-auto-issue';
import { registerSchema, parseBody } from '@/lib/validation';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Rate limiting: IP-based (10 req/min) + per-restaurant (20 reg/min)
const ipLimiter = rateLimit({ prefix: 'register-ip', limit: 10, windowMs: 60_000 });
const RATE_WINDOW_MS = 60_000;
const RATE_MAX       = 20;

export async function POST(req: NextRequest) {
  // IP-based rate limit
  const ip = getClientIp(req);
  if (!ipLimiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  const body = await req.json();

  // Validate input with Zod
  const parsed = parseBody(registerSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const {
    restaurantSlug,
    firstName,
    lastName,
    email,
    birthDate,
    postalCode,
    marketingConsent,
  } = parsed.data;

  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', restaurantSlug)
    .single();

  if (restError || !restaurant) {
    return NextResponse.json(
      { error: 'Restaurant introuvable' },
      { status: 404 }
    );
  }

  // ── Rate limit: max RATE_MAX registrations per restaurant per RATE_WINDOW_MS ──
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant.id)
    .gte('created_at', windowStart);

  if (recentCount !== null && recentCount >= RATE_MAX) {
    return NextResponse.json(
      { error: 'Trop d\'inscriptions récentes. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      restaurant_id: restaurant.id,
      first_name: firstName,
      last_name: lastName,
      email: email.toLowerCase().trim(),
      birth_date: birthDate || null,
      postal_code: postalCode || null,
      marketing_consent: true,
      consent_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Vous êtes déjà inscrit(e) pour ce restaurant.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  try {
    await sendWelcomeEmail({
      to: email,
      firstName,
      restaurantName: restaurant.name,
      restaurantColor: restaurant.color,
      qrToken: customer.qr_token,
    });
  } catch (emailError) {
    console.error('Erreur email:', emailError);
  }

  let walletLink = null;
  try {
    walletLink = await generateWalletUrl({
      customerId:     customer.id,
      firstName,
      totalPoints:    0,
      restaurantName: restaurant.name,
      restaurantId:   restaurant.id,
      primaryColor:   restaurant.primary_color ?? '#FF6B35',
      logoUrl:        restaurant.logo_url ?? null,
    });
  } catch (walletError) {
    console.error('Erreur Google Wallet:', walletError);
  }

  // Auto-issue Apple Wallet pass if the restaurant has a default template configured.
  // Never fails registration — passId will be null when Apple Wallet is not set up.
  const applePassId = await autoIssueApplePass({
    restaurantId: restaurant.id,
    customerId: customer.id,
  });
  const appleWalletUrl = applePassId
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${applePassId}/pkpass`
    : null;

  return NextResponse.json({
    success: true,
    qrToken: customer.qr_token,
    customerName: `${firstName} ${lastName}`,
    restaurantName: restaurant.name,
    walletLink,
    appleWalletUrl,
  });
}
