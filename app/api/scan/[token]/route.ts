// app/api/scan/[customerId]/route.ts
import { createClient } from '@supabase/supabase-js'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Vérifie l'owner
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Récupère le restaurant de l'owner
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!restaurant) return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })

  // Récupère le client
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('id, first_name, last_name, total_points, restaurant_id')
    .eq('id', customerId)
    .single()

  if (cErr || !customer) return Response.json({ error: 'Client introuvable' }, { status: 404 })

  // Vérifie que le client appartient au restaurant
  if (customer.restaurant_id !== restaurant.id) {
    return Response.json({ error: 'Client invalide' }, { status: 403 })
  }

  // Récupère la config fidélité
  const { data: settings } = await supabase
    .from('loyalty_settings')
    .select('points_per_scan, reward_threshold, reward_message')
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()

  const pointsToAdd = settings?.points_per_scan ?? 1
  const newBalance = customer.total_points + pointsToAdd
  const rewardThreshold = settings?.reward_threshold ?? 100
  const rewardTriggered = customer.total_points < rewardThreshold && newBalance >= rewardThreshold

  // Insère la transaction
  await supabase.from('transactions').insert({
    restaurant_id: restaurant.id,
    customer_id: customer.id,
    type: 'visit',
    points_delta: pointsToAdd,
    balance_after: newBalance,
    metadata: { reason: 'Scan caisse' },
  })

  return Response.json({
    success: true,
    customer: {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      total_points: newBalance,
    },
    points_added: pointsToAdd,
    reward_triggered: rewardTriggered,
    reward_message: settings?.reward_message ?? 'Récompense offerte !',
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('id, first_name, last_name, total_points, last_visit_at, restaurant_id')
    .eq('id', customerId)
    .single()

  if (cErr || !customer) return Response.json({ error: 'Client introuvable' }, { status: 404 })

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!restaurant || customer.restaurant_id !== restaurant.id) {
    return Response.json({ error: 'Accès refusé' }, { status: 403 })
  }

  return Response.json({ customer })
}
