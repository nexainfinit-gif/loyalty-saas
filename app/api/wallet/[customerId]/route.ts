import { createClient } from '@supabase/supabase-js'
import { generateWalletUrl } from '@/lib/google-wallet'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('id, first_name, total_points, restaurant_id')
    .eq('id', customerId)
    .single()

  if (cErr || !customer) {
    return Response.json({ error: 'Client introuvable' }, { status: 404 })
  }

  const { data: restaurant, error: rErr } = await supabase
    .from('restaurants')
    .select('id, name, slug, primary_color, logo_url')
    .eq('id', customer.restaurant_id)
    .single()

  if (rErr || !restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })
  }

  const walletUrl = await generateWalletUrl({
    customerId: customer.id,
    firstName: customer.first_name,
    totalPoints: customer.total_points,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    primaryColor: restaurant.primary_color,
    logoUrl: restaurant.logo_url,
  })

  await supabase
    .from('customers')
    .update({ wallet_card_url: walletUrl })
    .eq('id', customerId)

    console.log('Wallet URL générée:', walletUrl)

  return Response.json({ walletUrl })
}