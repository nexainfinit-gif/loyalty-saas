import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: restaurant, error: rErr } = await supabase
    .from('restaurants')
    .select('id, name, primary_color')
    .eq('slug', slug)
    .single()

  if (rErr || !restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const { first_name, email, birth_date, phone, consent_marketing } = body

  if (!first_name || !email) {
    return Response.json({ error: 'Prénom et email requis' }, { status: 400 })
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

  if (consent_marketing && process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: 'ReBites <noreply@rebites.app>',
        to: email,
        subject: `Bienvenue chez ${restaurant.name} 🎉`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
            <div style="background: ${restaurant.primary_color}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
              <h1 style="color: white; margin: 0;">Bienvenue, ${first_name} ! 🎉</h1>
            </div>
            <p>Votre carte fidélité <strong>${restaurant.name}</strong> est active.</p>
            <p>Vous avez reçu <strong>10 points de bienvenue</strong> !</p>
          </div>
        `,
      })
    } catch (emailErr) {
      console.error('Email error:', emailErr)
    }
  }

  return Response.json({ success: true, customer_id: customer.id })
}