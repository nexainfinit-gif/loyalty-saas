import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

// 30 requests per minute per IP — enough for normal browsing, blocks brute-force enumeration
const limiter = rateLimit({ prefix: 'restaurant-lookup', limit: 30, windowMs: 60_000 })

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip = getClientIp(req)
  if (!limiter.check(ip).success) {
    return Response.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429 },
    )
  }

  const { slug } = await params

  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select('id, name, primary_color, logo_url, city')
    .eq('slug', slug)
    .single()

  if (error || !restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 })
  }

  return Response.json({ restaurant })
}