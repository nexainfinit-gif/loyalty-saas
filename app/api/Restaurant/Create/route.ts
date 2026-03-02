import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'No token' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Vérifie si restaurant existe déjà pour cet owner
  const { data: existingOwner } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (existingOwner) return Response.json({ error: 'Restaurant déjà créé' }, { status: 409 })

  const { name, slug, email, city, phone, business_type, primary_color, logo_url } = await req.json()

  if (!name || !slug) {
    return Response.json({ error: 'Nom et slug requis' }, { status: 400 })
  }

  // Vérifie slug unique
  const { data: existingSlug } = await supabase
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existingSlug) return Response.json({ error: 'Slug déjà pris' }, { status: 409 })

  // Resolve the free plan id for plan_id FK
  const { data: freePlan } = await supabase
    .from('plans')
    .select('id')
    .eq('key', 'free')
    .maybeSingle()

  const { data, error } = await supabase
    .from('restaurants')
    .insert({
      name,
      slug,
      owner_id: user.id,
      email: email ?? null,
      city: city ?? null,
      phone: phone ?? null,
      business_type: business_type ?? 'restaurant',
      plan: 'free',
      plan_id: freePlan?.id ?? null,
      primary_color: primary_color ?? '#FF6B35',
      logo_url: logo_url ?? null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ restaurant: data })
}
