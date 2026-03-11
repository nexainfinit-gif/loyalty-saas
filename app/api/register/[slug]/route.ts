import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { Resend } from 'resend'
import { autoIssueApplePass } from '@/lib/wallet-auto-issue'
import { registerSlugSchema, parseBody } from '@/lib/validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { checkPlanLimit, planLimitError } from '@/lib/plan-limits'
import { logger } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)

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

  const body = await req.json()

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

  const { first_name, email, birth_date, phone, consent_marketing } = parsed.data

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

  // Auto-issue Apple Wallet pass if the restaurant has a default template.
  const applePassId = await autoIssueApplePass({
    restaurantId: restaurant.id,
    customerId: customer.id,
  })
  const appleWalletUrl = applePassId
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${applePassId}/pkpass`
    : null

  if (consent_marketing && process.env.RESEND_API_KEY) {
    const safeName  = restaurant.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const safeFname = first_name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const safeColor = /^#[0-9A-Fa-f]{3,6}$/.test(restaurant.primary_color ?? '') ? restaurant.primary_color : '#FF6B35'

    try {
      await resend.emails.send({
        from: `${restaurant.name} <noreply@rebites.be>`,
        to: email,
        subject: `Bienvenue chez ${restaurant.name} 🎉`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
            <div style="background: ${safeColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
              <h1 style="color: white; margin: 0;">Bienvenue, ${safeFname} ! 🎉</h1>
            </div>
            <p>Votre carte fidélité <strong>${safeName}</strong> est active.</p>
            <p>Vous avez reçu <strong>10 points de bienvenue</strong> !</p>
            ${appleWalletUrl ? `
            <div style="text-align: center; margin: 1.5rem 0;">
              <a href="${appleWalletUrl}" target="_blank" style="display: inline-block; background: #000000; color: #ffffff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
                 Ajouter à Apple Wallet
              </a>
            </div>
            ` : ''}
          </div>
        `,
      })
    } catch (emailErr) {
      logger.error({ ctx: 'register/slug', rid: restaurant.id, msg: 'Welcome email failed', err: emailErr })
    }
  }

  return Response.json({ success: true, customer_id: customer.id, appleWalletUrl })
}