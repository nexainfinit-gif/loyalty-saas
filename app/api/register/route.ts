import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { sendWelcomeEmail } from '@/lib/email';
import { generateWalletUrl } from '@/lib/google-wallet';
import { autoIssueApplePass } from '@/lib/wallet-auto-issue';
import { registerSchema, parseBody } from '@/lib/validation';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { checkPlanLimit, planLimitError } from '@/lib/plan-limits';
import { logger } from '@/lib/logger';

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

  // Turnstile CAPTCHA verification (skip if secret not configured)
  if (process.env.TURNSTILE_SECRET_KEY) {
    const captchaToken = body.captchaToken;
    if (!captchaToken) {
      return NextResponse.json(
        { error: 'Vérification anti-spam échouée. Veuillez réessayer.' },
        { status: 400 },
      );
    }
    try {
      const turnstileRes = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: captchaToken,
            remoteip: ip,
          }),
        },
      );
      const turnstileData = await turnstileRes.json();
      if (!turnstileData.success) {
        return NextResponse.json(
          { error: 'Vérification anti-spam échouée. Veuillez réessayer.' },
          { status: 400 },
        );
      }
    } catch {
      // If Turnstile is down, let the request through rather than blocking legitimate users
      logger.warn({ ctx: 'register', msg: 'Turnstile verification failed — skipping' });
    }
  }

  // Validate input with Zod
  const parsed = parseBody(registerSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: (parsed as { success: false; error: string }).error }, { status: 400 });
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

  // ── Plan limit: maxCustomers ──
  const { allowed, limit, current } = await checkPlanLimit(restaurant.id, restaurant.plan, 'customers');
  if (!allowed) {
    return NextResponse.json(planLimitError('customers', current, limit), { status: 403 });
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
      consent_ip: ip,
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
    logger.error({ ctx: 'register', rid: restaurant.id, msg: 'Google Wallet URL generation failed', err: walletError });
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

  try {
    await sendWelcomeEmail({
      to: email,
      firstName,
      restaurantName: restaurant.name,
      restaurantColor: restaurant.color,
      qrToken: customer.qr_token,
      appleWalletUrl,
    });
  } catch (emailError) {
    logger.error({ ctx: 'register', rid: restaurant.id, msg: 'Welcome email failed', err: emailError });
  }

  return NextResponse.json({
    success: true,
    qrToken: customer.qr_token,
    customerName: `${firstName} ${lastName}`,
    restaurantName: restaurant.name,
    walletLink,
    appleWalletUrl,
  });
}
