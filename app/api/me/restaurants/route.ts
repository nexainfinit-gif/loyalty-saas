import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/restaurants — établissements accessibles par l'utilisateur :
 * possédés (role 'owner') + rattachements d'équipe (team_members, option B).
 * Utilisé par le client pour le sélecteur et le fallback membre d'équipe.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request, { allowStaff: true });
  if (guard instanceof NextResponse) return guard;

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabaseAdmin
      .from('restaurants')
      .select('id, name, slug')
      .eq('owner_id', guard.userId)
      .neq('is_demo', true)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('team_members')
      .select('restaurant_id, role')
      .eq('user_id', guard.userId),
  ]);

  const list: { id: string; name: string; slug: string; role: string }[] =
    (owned ?? []).map((r) => ({ id: r.id, name: r.name ?? r.slug, slug: r.slug, role: 'owner' }));

  const memberIds = (memberships ?? [])
    .map((m) => m.restaurant_id)
    .filter((id) => !list.some((r) => r.id === id));
  if (memberIds.length) {
    const { data: teamRestos } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, slug')
      .in('id', memberIds);
    for (const r of teamRestos ?? []) {
      const role = (memberships ?? []).find((m) => m.restaurant_id === r.id)?.role ?? 'staff';
      list.push({ id: r.id, name: r.name ?? r.slug, slug: r.slug, role });
    }
  }

  return NextResponse.json({ restaurants: list });
}
