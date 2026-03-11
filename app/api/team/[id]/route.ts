import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── DELETE /api/team/[id] ─────────────────────────────────────────────── */

/**
 * Revoke a pending invite OR remove an existing team member.
 * Tries team_invites first, then team_members.
 * Auth: restaurant owner only.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { id } = await params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  }

  // Try revoking a pending invite first (scoped to this restaurant)
  const { data: invite } = await supabaseAdmin
    .from('team_invites')
    .select('id, restaurant_id')
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId)
    .eq('status', 'pending')
    .maybeSingle();

  if (invite) {
    const { error } = await supabaseAdmin
      .from('team_invites')
      .update({ status: 'expired' })
      .eq('id', id)
      .eq('restaurant_id', guard.restaurantId);

    if (error) {
      return NextResponse.json({ error: 'Erreur lors de la révocation de l\'invitation.' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Invitation révoquée.' });
  }

  // Try removing a team member (scoped to this restaurant)
  const { data: member } = await supabaseAdmin
    .from('team_members')
    .select('id, restaurant_id')
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();

  if (member) {
    const { error } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', guard.restaurantId);

    if (error) {
      return NextResponse.json({ error: 'Erreur lors de la suppression du membre.' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Membre supprimé de l\'équipe.' });
  }

  return NextResponse.json({ error: 'Invitation ou membre introuvable.' }, { status: 404 });
}
