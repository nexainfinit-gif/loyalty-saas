// app/api/campaigns/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth, requireFeature } from '@/lib/server-auth'
import { NextResponse } from 'next/server'
import { mailer as resend } from '@/lib/mailer'
import { checkPlanLimit, checkEmailQuota, planLimitError } from '@/lib/plan-limits'
import { logger } from '@/lib/logger'
import { auditLog } from '@/lib/audit'


export async function POST(req: Request) {
  const guard = await requireAuth(req)
  if (guard instanceof NextResponse) return guard
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const { name, type, subject, bodyText, segment, scheduled_at, eventId } = body

  // Les ANNONCES D'ÉVÉNEMENT font partie du produit billetterie (plan
  // gratuit + commission) : pas de gate campaigns_email — mais les quotas
  // (campagnes/mois + emails/mois) s'appliquent comme à tout le monde.
  if (!eventId) {
    const featureGate = requireFeature(guard, 'campaigns_email', 'Campagnes email')
    if (featureGate) return featureGate
  }

  // ── Plan limit: maxCampaignsPerMonth ──
  const { allowed, limit, current } = await checkPlanLimit(guard.restaurantId, guard.plan, 'campaigns')
  if (!allowed) {
    return Response.json(planLimitError('campaigns', current, limit), { status: 403 })
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants').select('id, name, primary_color, slug')
    .eq('id', guard.restaurantId).single()
  if (!restaurant) return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })

  if (eventId) {
    return sendEventAnnouncement({ guard, restaurant, eventId, subject, bodyText, name })
  }

  if (!name || !subject || !bodyText || !segment) {
    return Response.json({ error: 'Champs manquants' }, { status: 400 })
  }

  if (typeof bodyText !== 'string' || bodyText.length > 5000) {
    return Response.json({ error: 'Le contenu de la campagne est trop long (max 5000 caractères).' }, { status: 400 })
  }
  if (typeof subject !== 'string' || subject.length > 200) {
    return Response.json({ error: 'L\'objet est trop long (max 200 caractères).' }, { status: 400 })
  }
  if (typeof name !== 'string' || name.length > 100) {
    return Response.json({ error: 'Le nom est trop long (max 100 caractères).' }, { status: 400 })
  }

  // Fetch loyalty settings for VIP threshold
  const { data: loyaltySettings } = await supabaseAdmin
    .from('loyalty_settings').select('program_type, vip_threshold_points, vip_threshold_stamps, reward_threshold')
    .eq('restaurant_id', restaurant.id).maybeSingle()

  const programType = loyaltySettings?.program_type ?? 'points'
  const vipThreshold = programType === 'stamps'
    ? (loyaltySettings?.vip_threshold_stamps ?? 10)
    : (loyaltySettings?.vip_threshold_points ?? 100)
  const rewardThreshold = loyaltySettings?.reward_threshold ?? 100

  // Récupère les destinataires selon le segment
  const { data: allCustomers } = await supabaseAdmin
    .from('customers').select('id, first_name, last_name, email, total_points, stamps_count, last_visit_at, birth_date, consent_marketing, qr_token')
    .eq('restaurant_id', restaurant.id)

  const customers = allCustomers ?? []
  const now = Date.now()

  const recipients = customers.filter(c => {
    if (!c.consent_marketing) return false
    if (!c.email) return false

    switch (segment) {
      case 'inactive_45':
        return !c.last_visit_at || (now - new Date(c.last_visit_at).getTime()) > 45 * 86400000
      case 'birthday':
        if (!c.birth_date) return false
        const b = new Date(c.birth_date)
        const today = new Date()
        const next = new Date(today.getFullYear(), b.getMonth(), b.getDate())
        const in7 = new Date(); in7.setDate(today.getDate() + 7)
        return next >= today && next <= in7
      case 'near_reward':
        return c.total_points >= (rewardThreshold * 0.8) && c.total_points < rewardThreshold
      case 'all':
        return true
      case 'active':
        return c.last_visit_at && (now - new Date(c.last_visit_at).getTime()) < 30 * 86400000
      case 'vip':
        if (programType === 'stamps') {
          return (c.stamps_count ?? 0) >= vipThreshold
        }
        return c.total_points >= vipThreshold
      default:
        return true
    }
  })

  // ── Quota d'emails du mois (migration 036 — protège la marge) ──
  // Vérifié APRÈS le calcul des destinataires : la campagne n'est acceptée
  // que si (emails déjà envoyés ce mois) + destinataires ≤ quota du plan.
  const emailQuota = await checkEmailQuota(restaurant.id, guard.plan, recipients.length)
  if (!emailQuota.allowed) {
    return Response.json(
      {
        ...planLimitError('emails', emailQuota.current, emailQuota.limit),
        error: `Quota d'emails atteint pour votre plan (${emailQuota.current} envoyés ce mois-ci, ` +
               `cette campagne en ajouterait ${recipients.length}, quota : ${emailQuota.limit}). ` +
               `Réduisez le segment ou passez au plan supérieur.`,
      },
      { status: 403 },
    )
  }

  // Sauvegarde la campagne.
  // segment_type/content sont des colonnes legacy (NOT NULL avant migration 037)
  // dupliquant segment/body — on les remplit pour rester compatible même si la
  // migration n'a pas encore été appliquée.
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from('campaigns').insert({
      restaurant_id: restaurant.id,
      name,
      type: type ?? 'custom',
      subject,
      body: bodyText,
      content: bodyText,
      segment,
      segment_type: segment,
      status: scheduled_at ? 'scheduled' : 'sending',
      scheduled_at: scheduled_at || null, // '' du formulaire = non planifiée ('??' laissait passer la chaîne vide → timestamp invalide)
      recipients_count: recipients.length,
    }).select().single()

  if (campErr || !campaign) {
    logger.error({ ctx: 'campaigns', rid: restaurant.id, msg: 'campaign insert failed', err: campErr?.message })
    return Response.json({ error: 'Erreur création campagne' }, { status: 500 })
  }

  // Si planifiée, on s'arrête là
  if (scheduled_at) {
    return Response.json({ success: true, campaign_id: campaign.id, recipients: recipients.length, scheduled: true })
  }

  // Envoi par batch (Resend batch API — max 100 emails par appel)
  const BATCH_SIZE = 100
  let sentCount = 0
  let failCount = 0
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const allEmails = recipients.map(customer => {
    const personalizedBody = bodyText
      .replace(/\{\{prenom\}\}/gi, customer.first_name)
      .replace(/\{\{points\}\}/gi, String(customer.total_points))
      .replace(/\{\{restaurant\}\}/gi, restaurant.name)

    const personalizedSubject = subject
      .replace(/\{\{prenom\}\}/gi, customer.first_name)
      .replace(/\{\{restaurant\}\}/gi, restaurant.name)

    const unsubscribeUrl = customer.qr_token
      ? `${appUrl}/api/unsubscribe?token=${customer.qr_token}`
      : null

    return {
      from: `${restaurant.name} <noreply@rebites.be>`,
      to: customer.email,
      subject: personalizedSubject,
      html: buildEmailHtml({
        firstName: customer.first_name,
        body: personalizedBody,
        restaurantName: restaurant.name,
        primaryColor: restaurant.primary_color,
        points: customer.total_points,
        unsubscribeUrl,
      }),
    }
  })

  // Send in batches of BATCH_SIZE
  for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
    const batch = allEmails.slice(i, i + BATCH_SIZE)
    try {
      if (batch.length === 1) {
        await resend.emails.send(batch[0])
        sentCount += 1
      } else {
        const { data, error: batchErr } = await resend.batch.send(batch)
        if (batchErr) {
          logger.error({ ctx: 'campaigns', rid: restaurant.id, msg: `Batch ${i / BATCH_SIZE} failed`, err: batchErr })
          failCount += batch.length
        } else {
          sentCount += data?.data?.length ?? batch.length
        }
      }
    } catch (err) {
      logger.error({ ctx: 'campaigns', rid: restaurant.id, msg: `Batch ${i / BATCH_SIZE} error`, err })
      failCount += batch.length
    }
  }

  // Mise à jour statut campagne
  await supabaseAdmin.from('campaigns').update({
    status: failCount === recipients.length ? 'failed' : 'sent',
    sent_at: new Date().toISOString(),
    recipients_count: sentCount,
  }).eq('id', campaign.id)

  // Fire-and-forget audit log
  auditLog({
    restaurantId: restaurant.id,
    actorId: guard.userId,
    action: 'campaign_send',
    targetType: 'campaign',
    targetId: campaign.id,
    metadata: {
      name,
      segment,
      sent: sentCount,
      failed: failCount,
      total: recipients.length,
    },
  })

  return Response.json({
    success: true,
    campaign_id: campaign.id,
    sent: sentCount,
    failed: failCount,
    total: recipients.length,
  })
}

export async function GET(req: Request) {
  const guard = await requireAuth(req)
  if (guard instanceof NextResponse) return guard
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })
  }

  const url   = new URL(req.url)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10)))
  const page  = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  const { data: campaigns, count } = await supabaseAdmin
    .from('campaigns').select('*', { count: 'exact' })
    .eq('restaurant_id', guard.restaurantId)
    .order('created_at', { ascending: false })
    .range(from, to)

  return Response.json({ campaigns: campaigns ?? [], total: count ?? 0, page, limit })
}

/* ── Annonce d'événement (Rebites Events) ─────────────────────────────────
 * Audience = clients fidélité consentants (consent_marketing) ∪ acheteurs
 * de billets ayant coché l'opt-in à l'achat (052), dédupliqués par email.
 * Chaque destinataire a SON lien de désabonnement (qr_token pour les
 * clients, code billet pour les acheteurs). Envoi immédiat uniquement. */
async function sendEventAnnouncement({ guard, restaurant, eventId, subject, bodyText, name }: {
  guard: { restaurantId: string | null; plan: string | null; userId: string }
  restaurant: { id: string; name: string; primary_color: string; slug: string }
  eventId: unknown
  subject: unknown
  bodyText: unknown
  name: unknown
}) {
  if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return Response.json({ error: 'Événement invalide.' }, { status: 400 })
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200) {
    return Response.json({ error: 'Objet requis (max 200 caractères).' }, { status: 400 })
  }
  if (typeof bodyText !== 'string' || !bodyText.trim() || bodyText.length > 5000) {
    return Response.json({ error: 'Message requis (max 5000 caractères).' }, { status: 400 })
  }

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, title, slug, starts_at, location, price, status')
    .eq('id', eventId)
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()
  if (!event || event.status !== 'published') {
    return Response.json({ error: 'Événement introuvable ou non publié.' }, { status: 404 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // ── Audience ──
  const [{ data: allCustomers }, { data: buyerRows }] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('first_name, email, consent_marketing, qr_token')
      .eq('restaurant_id', restaurant.id),
    supabaseAdmin
      .from('event_tickets')
      .select('buyer_email, buyer_name, code')
      .eq('restaurant_id', restaurant.id)
      .eq('marketing_opt_in', true)
      .in('status', ['valid', 'checked_in']),
  ])

  const recipients: { email: string; firstName: string; unsubscribeUrl: string | null }[] = []
  const seen = new Set<string>()
  for (const c of allCustomers ?? []) {
    if (!c.consent_marketing || !c.email) continue
    const em = c.email.toLowerCase()
    if (seen.has(em)) continue
    seen.add(em)
    recipients.push({
      email: c.email,
      firstName: c.first_name ?? '',
      unsubscribeUrl: c.qr_token ? `${appUrl}/api/unsubscribe?token=${c.qr_token}` : null,
    })
  }
  for (const b of buyerRows ?? []) {
    const em = (b.buyer_email ?? '').toLowerCase()
    if (!em || seen.has(em)) continue
    seen.add(em)
    recipients.push({
      email: em,
      firstName: (b.buyer_name ?? '').trim().split(/\s+/)[0] ?? '',
      unsubscribeUrl: `${appUrl}/api/event/unsubscribe?code=${b.code}`,
    })
  }

  if (recipients.length === 0) {
    return Response.json({ error: 'Aucun destinataire : personne n\'a encore accepté de recevoir vos annonces.' }, { status: 400 })
  }

  // ── Quota emails du mois ──
  const emailQuota = await checkEmailQuota(restaurant.id, guard.plan, recipients.length)
  if (!emailQuota.allowed) {
    return Response.json(
      {
        ...planLimitError('emails', emailQuota.current, emailQuota.limit),
        error: `Quota d'emails atteint (${emailQuota.current} envoyés ce mois-ci, cette annonce en ajouterait ${recipients.length}, quota : ${emailQuota.limit}).`,
      },
      { status: 403 },
    )
  }

  const { data: campaign, error: campErr } = await supabaseAdmin
    .from('campaigns').insert({
      restaurant_id: restaurant.id,
      name: typeof name === 'string' && name ? name.slice(0, 100) : `Annonce — ${event.title}`.slice(0, 100),
      type: 'event',
      subject,
      body: bodyText,
      content: bodyText,
      segment: 'event_audience',
      segment_type: 'event_audience',
      status: 'sending',
      recipients_count: recipients.length,
    }).select().single()
  if (campErr || !campaign) {
    logger.error({ ctx: 'campaigns', rid: restaurant.id, msg: 'event campaign insert failed', err: campErr?.message })
    return Response.json({ error: 'Erreur création campagne' }, { status: 500 })
  }

  const eventUrl = `${appUrl}/fr/event/${restaurant.slug}/${event.slug}`
  const when = new Date(event.starts_at).toLocaleString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels',
  })

  const allEmails = recipients.map(r => ({
    from: `${restaurant.name} <noreply@rebites.be>`,
    to: r.email,
    subject: subject.replace(/\{\{prenom\}\}/gi, r.firstName).replace(/\{\{restaurant\}\}/gi, restaurant.name),
    html: buildEventAnnouncementHtml({
      firstName: r.firstName,
      body: bodyText.replace(/\{\{prenom\}\}/gi, r.firstName).replace(/\{\{restaurant\}\}/gi, restaurant.name),
      businessName: restaurant.name,
      primaryColor: restaurant.primary_color,
      eventTitle: event.title,
      when,
      location: event.location,
      price: Number(event.price),
      eventUrl,
      unsubscribeUrl: r.unsubscribeUrl,
    }),
  }))

  // Envoi par batch (Resend batch API — max 100 emails par appel)
  const BATCH_SIZE = 100
  let sentCount = 0
  let failCount = 0
  for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
    const batch = allEmails.slice(i, i + BATCH_SIZE)
    try {
      if (batch.length === 1) {
        await resend.emails.send(batch[0])
        sentCount += 1
      } else {
        const { data, error: batchErr } = await resend.batch.send(batch)
        if (batchErr) {
          logger.error({ ctx: 'campaigns', rid: restaurant.id, msg: `Event batch ${i / BATCH_SIZE} failed`, err: batchErr })
          failCount += batch.length
        } else {
          sentCount += data?.data?.length ?? batch.length
        }
      }
    } catch (err) {
      logger.error({ ctx: 'campaigns', rid: restaurant.id, msg: `Event batch ${i / BATCH_SIZE} error`, err })
      failCount += batch.length
    }
  }

  await supabaseAdmin.from('campaigns').update({
    status: failCount === recipients.length ? 'failed' : 'sent',
    sent_at: new Date().toISOString(),
    recipients_count: sentCount,
  }).eq('id', campaign.id)

  auditLog({
    restaurantId: restaurant.id,
    actorId: guard.userId,
    action: 'campaign_send',
    targetType: 'campaign',
    targetId: campaign.id,
    metadata: { name: campaign.name, segment: 'event_audience', eventId: event.id, sent: sentCount, failed: failCount, total: recipients.length },
  })

  return Response.json({ success: true, campaign_id: campaign.id, sent: sentCount, failed: failCount, total: recipients.length })
}

function buildEventAnnouncementHtml({ firstName, body, businessName, primaryColor, eventTitle, when, location, price, eventUrl, unsubscribeUrl }: {
  firstName: string
  body: string
  businessName: string
  primaryColor: string
  eventTitle: string
  when: string
  location: string | null
  price: number
  eventUrl: string
  unsubscribeUrl: string | null
}) {
  const color = safeCssColor(primaryColor)
  const safeBiz = esc(businessName)
  const safeTitle = esc(eventTitle)
  const bodyHtml = esc(body).replace(/\n/g, '<br/>')
  const hello = firstName ? `Bonjour <strong>${esc(firstName)}</strong> 👋` : 'Bonjour 👋'

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header sombre façon talon de billet -->
        <tr><td style="background:#0C0C0E;border-radius:16px 16px 0 0;padding:32px;text-align:center;">
          <p style="color:${color};margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;">✦ ${safeBiz}</p>
          <h1 style="color:white;margin:0;font-size:26px;font-weight:800;">${safeTitle}</h1>
          <p style="color:rgba(255,255,255,0.65);margin:10px 0 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">
            ${esc(when)}${location ? ` — ${esc(location)}` : ''}
          </p>
        </td></tr>

        <!-- Message de l'organisateur -->
        <tr><td style="background:white;padding:32px;">
          <p style="font-size:16px;color:#374151;line-height:1.6;margin:0 0 16px;">${hello}</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px;">${bodyHtml}</p>
          <div style="text-align:center;margin:28px 0 8px;">
            <a href="${eventUrl}" style="display:inline-block;background:${color};color:white;text-decoration:none;padding:0.9rem 2rem;border-radius:12px;font-weight:700;font-size:15px;">
              ${price > 0 ? `Réserver — ${price} €` : 'Réserver ma place'} →
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F9FAFB;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;border-top:1px solid #F3F4F6;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            Vous recevez cet email car vous avez accepté de recevoir les événements de ${safeBiz}.<br/>
            ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Se désinscrire</a> &nbsp;·&nbsp; ` : ''}Propulsé par <strong>Rebites Events</strong>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function safeCssColor(color: string): string {
  return /^#[0-9A-Fa-f]{3,6}$/.test(color) ? color : '#FF6B35'
}

function buildEmailHtml({ firstName, body, restaurantName, primaryColor, points, unsubscribeUrl }: {
  firstName: string
  body: string
  restaurantName: string
  primaryColor: string
  points: number
  unsubscribeUrl: string | null
}) {
  const color = safeCssColor(primaryColor)
  const safeName  = esc(restaurantName)
  const safeFname = esc(firstName)
  const bodyHtml  = esc(body).replace(/\n/g, '<br/>')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        
        <!-- Header -->
        <tr><td style="background:${color};border-radius:16px 16px 0 0;padding:32px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">${safeName}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:white;padding:32px;">
          <p style="font-size:16px;color:#374151;line-height:1.6;margin:0 0 20px;">
            Bonjour <strong>${safeFname}</strong> 👋
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px;">
            ${bodyHtml}
          </p>
          
          <!-- Points badge -->
          <div style="background:#F0FDF4;border-radius:12px;padding:16px;text-align:center;margin:24px 0;">
            <p style="margin:0;font-size:13px;color:#6B7280;">Votre solde actuel</p>
            <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#15803D;">${points} pts</p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F9FAFB;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;border-top:1px solid #F3F4F6;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            Vous recevez cet email car vous êtes inscrit au programme fidélité de ${safeName}.<br/>
            ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Se désinscrire</a> &nbsp;·&nbsp; ` : ''}Propulsé par <strong>ReBites</strong>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
