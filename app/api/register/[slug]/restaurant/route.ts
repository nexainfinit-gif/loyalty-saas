import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
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