import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { sendWelcomeEmail, sendVerificationEmail } from '@/lib/email';
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

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Format JSON invalide.' }, { status: 400 }); }

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
    ref,
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

  const emailVerificationToken = crypto.randomUUID();

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
      email_verified: false,
      email_verification_token: emailVerificationToken,
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

  // Send verification email (non-blocking — never fails registration)
  try {
    await sendVerificationEmail({
      to: email,
      firstName,
      restaurantName: restaurant.name,
      restaurantColor: restaurant.color || '#FF6B35',
      verificationToken: emailVerificationToken,
    });
  } catch (verifyEmailError) {
    logger.error({ ctx: 'register', rid: restaurant.id, msg: 'Verification email failed', err: verifyEmailError });
  }

  // ── Handle referral if ref code provided (non-blocking) ──────────────
  let referralCode: string | null = null;
  let referralBonus: { referrer: number; referee: number } | null = null;
  try {
    const { generateReferralCode } = await import('@/lib/referral');
    referralCode = await generateReferralCode(restaurant.id, customer.id);
  } catch (refCodeErr) {
    logger.error({ ctx: 'register', rid: restaurant.id, msg: 'Referral code generation failed', err: refCodeErr });
  }

  if (ref && ref.trim()) {
    try {
      const { getReferralConfig, validateReferralCode, processReferral } = await import('@/lib/referral');
      const config = await getReferralConfig(restaurant.id);
      if (config.enabled) {
        // Fetch loyalty settings for program_type
        const { data: loyaltySettings } = await supabase
          .from('loyalty_settings')
          .select('program_type')
          .eq('restaurant_id', restaurant.id)
          .maybeSingle();

        const validation = await validateReferralCode(restaurant.id, ref.trim(), email);
        if (validation.valid && validation.referrerId) {
          const result = await processReferral({
            restaurantId: restaurant.id,
            referrerId: validation.referrerId,
            refereeId: customer.id,
            programType: loyaltySettings?.program_type ?? 'points',
            config,
          });
          if (result.success) {
            referralBonus = {
              referrer: result.referrerReward ?? 0,
              referee: result.refereeReward ?? 0,
            };
          }
        }
      }
    } catch (refErr) {
      logger.error({ ctx: 'register', rid: restaurant.id, msg: 'Referral processing failed', err: refErr });
    }
  }

  return NextResponse.json({
    success: true,
    qrToken: customer.qr_token,
    customerName: `${firstName} ${lastName}`,
    restaurantName: restaurant.name,
    walletLink,
    appleWalletUrl,
    referralCode,
    referralBonus,
  });
}
