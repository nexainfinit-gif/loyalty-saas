import { supabaseAdmin } from '@/lib/supabase-admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const body = await req.json()
  const { email, first_name, last_name, birth_date, phone, consent_marketing } = body

  const { data: restaurant, error: rErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color')
    .eq('slug', params.slug)
    .single()

  if (rErr || !restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })
  }

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .insert({
      restaurant_id: restaurant.id,
      email,
      first_name,
      last_name,
      birth_date,
      phone,
      consent_marketing: consent_marketing ?? false,
    })
    .select()
    .single()

  if (error?.code === '23505') {
    return Response.json({ error: 'Email déjà inscrit' }, { status: 409 })
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (consent_marketing) {
    await resend.emails.send({
      from: 'noreply@rebites.app',
      to: email,
      subject: `Bienvenue chez ${restaurant.name} 🎉`,
      html: `<p>Bonjour ${first_name}, votre carte fidélité est active !</p>`,
    })
  }

  await supabaseAdmin.from('transactions').insert({
    restaurant_id: restaurant.id,
    customer_id: customer.id,
    type: 'visit',
    points_delta: 10,
    balance_after: 10,
    metadata: { reason: 'Inscription' },
  })

  return Response.json({ success: true, customer_id: customer.id })
}