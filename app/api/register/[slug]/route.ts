import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sendVerificationEmail } from '@/lib/email'
import { registerSlugSchema, parseBody } from '@/lib/validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { checkPlanLimit, planLimitError } from '@/lib/plan-limits'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

// Rate limiting: IP-based (10 req/min) + per-restaurant (20 reg/min)
const ipLimiter = rateLimit({ prefix: 'register-slug-ip', limit: 10, windowMs: 60_000 })
const RATE_WINDOW_MS = 60_000
const RATE_MAX       = 20

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  // IP-based rate limit
  const ip = getClientIp(req)
  if (!ipLimiter.check(ip).success) {
    return Response.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429 },
    )
  }

  const { slug } = await params

  const { data: restaurant, error: rErr } = await supabase
    .from('restaurants')
    .select('id, name, primary_color, plan')
    .eq('slug', slug)
    .single()

  if (rErr || !restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })
  }

  // ── Plan limit: maxCustomers ──
  const { allowed, limit, current } = await checkPlanLimit(restaurant.id, restaurant.plan, 'customers')
  if (!allowed) {
    return Response.json(planLimitError('customers', current, limit), { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  }

  // Turnstile CAPTCHA verification (skip if secret not configured)
  if (process.env.TURNSTILE_SECRET_KEY) {
    const captchaToken = body.captchaToken
    if (!captchaToken) {
      return Response.json(
        { error: 'Vérification anti-spam échouée. Veuillez réessayer.' },
        { status: 400 },
      )
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
      )
      const turnstileData = await turnstileRes.json()
      if (!turnstileData.success) {
        return Response.json(
          { error: 'Vérification anti-spam échouée. Veuillez réessayer.' },
          { status: 400 },
        )
      }
    } catch {
      // If Turnstile is down, let the request through rather than blocking legitimate users
      logger.warn({ ctx: 'register/slug', msg: 'Turnstile verification failed — skipping' })
    }
  }

  // Validate input with Zod
  const parsed = parseBody(registerSlugSchema, body)
  if (!parsed.success) {
    return Response.json({ error: (parsed as { success: false; error: string }).error }, { status: 400 })
  }

  const { first_name, email, birth_date, phone, consent_marketing, ref } = parsed.data

  // ── Rate limit: max RATE_MAX registrations per restaurant per RATE_WINDOW_MS ──
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant.id)
    .gte('created_at', windowStart);

  if (recentCount !== null && recentCount >= RATE_MAX) {
    return Response.json(
      { error: 'Trop d\'inscriptions récentes. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  const emailVerificationToken = crypto.randomUUID()

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      restaurant_id: restaurant.id,
      email,
      first_name,
      birth_date: birth_date ?? null,
      phone: phone ?? null,
      consent_marketing: consent_marketing ?? false,
      consent_ip: ip,
      email_verified: false,
      email_verification_token: emailVerificationToken,
    })
    .select()
    .single()

  if (error?.code === '23505') {
    return Response.json({ error: 'Email déjà inscrit' }, { status: 409 })
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('transactions').insert({
    restaurant_id: restaurant.id,
    customer_id: customer.id,
    type: 'points_add',
    points_delta: 10,
    balance_after: 10,
    metadata: { reason: 'Bienvenue' },
  })

  // Send verification email (no wallet card until email is confirmed)
  if (process.env.RESEND_API_KEY) {
    try {
      await sendVerificationEmail({
        to: email,
        firstName: first_name,
        restaurantName: restaurant.name,
        restaurantColor: restaurant.primary_color ?? '#FF6B35',
        verificationToken: emailVerificationToken,
      })
    } catch (emailErr) {
      logger.error({ ctx: 'register/slug', rid: restaurant.id, msg: 'Verification email failed', err: emailErr })
    }
  }

  // ── Handle referral if ref code provided (non-blocking) ──────────────
  let referralCode: string | null = null;
  let referralBonus: { referrer: number; referee: number } | null = null;
  try {
    const { generateReferralCode } = await import('@/lib/referral');
    referralCode = await generateReferralCode(restaurant.id, customer.id);
  } catch (refCodeErr) {
    logger.error({ ctx: 'register/slug', rid: restaurant.id, msg: 'Referral code generation failed', err: refCodeErr });
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
      logger.error({ ctx: 'register/slug', rid: restaurant.id, msg: 'Referral processing failed', err: refErr });
    }
  }

  return Response.json({ success: true, customer_id: customer.id, referralCode, referralBonus })
}