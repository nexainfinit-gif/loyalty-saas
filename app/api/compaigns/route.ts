// app/api/campaigns/route.ts
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: restaurant } = await supabase
    .from('restaurants').select('id, name, primary_color, slug')
    .eq('owner_id', user.id).maybeSingle()
  if (!restaurant) return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })

  const body = await req.json()
  const { name, type, subject, bodyText, segment, scheduled_at } = body

  if (!name || !subject || !bodyText || !segment) {
    return Response.json({ error: 'Champs manquants' }, { status: 400 })
  }

  // Récupère les destinataires selon le segment
  const { data: allCustomers } = await supabase
    .from('customers').select('id, first_name, last_name, email, total_points, last_visit_at, birth_date, consent_marketing')
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
        return c.total_points >= 80 && c.total_points < 100
      case 'all':
        return true
      case 'active':
        return c.last_visit_at && (now - new Date(c.last_visit_at).getTime()) < 30 * 86400000
      case 'vip':
        return c.total_points >= 100
      default:
        return true
    }
  })

  // Sauvegarde la campagne
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns').insert({
      restaurant_id: restaurant.id,
      name,
      type: type ?? 'custom',
      subject,
      body: bodyText,
      segment,
      status: scheduled_at ? 'scheduled' : 'sending',
      scheduled_at: scheduled_at ?? null,
      recipients_count: recipients.length,
    }).select().single()

  if (campErr || !campaign) {
    return Response.json({ error: 'Erreur création campagne' }, { status: 500 })
  }

  // Si planifiée, on s'arrête là
  if (scheduled_at) {
    return Response.json({ success: true, campaign_id: campaign.id, recipients: recipients.length, scheduled: true })
  }

  // Envoi immédiat
  let sentCount = 0
  let failCount = 0

  for (const customer of recipients) {
    const personalizedBody = bodyText
      .replace(/\{\{prenom\}\}/gi, customer.first_name)
      .replace(/\{\{points\}\}/gi, String(customer.total_points))
      .replace(/\{\{restaurant\}\}/gi, restaurant.name)

    const personalizedSubject = subject
      .replace(/\{\{prenom\}\}/gi, customer.first_name)
      .replace(/\{\{restaurant\}\}/gi, restaurant.name)

    try {
      await resend.emails.send({
        from: `${restaurant.name} <noreply@rebites.app>`,
        to: customer.email,
        subject: personalizedSubject,
        html: buildEmailHtml({
          firstName: customer.first_name,
          body: personalizedBody,
          restaurantName: restaurant.name,
          primaryColor: restaurant.primary_color,
          points: customer.total_points,
        }),
      })
      sentCount++
    } catch (err) {
      console.error(`Email failed for ${customer.email}:`, err)
      failCount++
    }
  }

  // Mise à jour statut campagne
  await supabase.from('campaigns').update({
    status: failCount === recipients.length ? 'failed' : 'sent',
    sent_at: new Date().toISOString(),
    recipients_count: sentCount,
  }).eq('id', campaign.id)

  return Response.json({
    success: true,
    campaign_id: campaign.id,
    sent: sentCount,
    failed: failCount,
    total: recipients.length,
  })
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: restaurant } = await supabase
    .from('restaurants').select('id')
    .eq('owner_id', user.id).maybeSingle()
  if (!restaurant) return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })

  const { data: campaigns } = await supabase
    .from('campaigns').select('*')
    .eq('restaurant_id', restaurant.id)
    .order('created_at', { ascending: false })

  return Response.json({ campaigns: campaigns ?? [] })
}

function buildEmailHtml({ firstName, body, restaurantName, primaryColor, points }: {
  firstName: string
  body: string
  restaurantName: string
  primaryColor: string
  points: number
}) {
  const color = primaryColor.startsWith('#') ? primaryColor : '#FF6B35'
  const bodyHtml = body.replace(/\n/g, '<br/>')

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
          <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">${restaurantName}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:white;padding:32px;">
          <p style="font-size:16px;color:#374151;line-height:1.6;margin:0 0 20px;">
            Bonjour <strong>${firstName}</strong> 👋
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
            Vous recevez cet email car vous êtes inscrit au programme fidélité de ${restaurantName}.<br/>
            Propulsé par <strong>ReBites</strong>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
