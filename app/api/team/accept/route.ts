import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── GET /api/team/accept?token=XXX ────────────────────────────────────── */

/**
 * Accept a team invite via token link (from email).
 * The user must be authenticated (logged in) to accept.
 * Creates a team_member row and marks the invite as accepted.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return NextResponse.json(
      { error: 'Token d\'invitation manquant.' },
      { status: 400 },
    );
  }

  // Look up the invite by token
  const { data: invite, error: lookupErr } = await supabaseAdmin
    .from('team_invites')
    .select('id, restaurant_id, email, role, status, expires_at')
    .eq('token', token.trim())
    .maybeSingle();

  if (lookupErr || !invite) {
    return NextResponse.json(
      { error: 'Invitation introuvable ou invalide.' },
      { status: 404 },
    );
  }

  // Check status
  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: 'Cette invitation a déjà été utilisée ou a expiré.' },
      { status: 410 },
    );
  }

  // Check expiration
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    // Mark as expired
    await supabaseAdmin
      .from('team_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return NextResponse.json(
      { error: 'Cette invitation a expiré. Demandez une nouvelle invitation au propriétaire.' },
      { status: 410 },
    );
  }

  // Authenticate the current user via cookie session
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    userEmail = user?.email?.toLowerCase() ?? null;
  } catch {
    // No session
  }

  if (!userId || !userEmail) {
    // Redirect to login with return URL
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/login?redirect=${encodeURIComponent(request.url)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Verify the authenticated user's email matches the invite email
  if (userEmail !== invite.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `Cette invitation est destinée à ${invite.email}. Connectez-vous avec cette adresse email pour l'accepter.`,
      },
      { status: 403 },
    );
  }

  // Check if already a team member
  const { data: existingMember } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('restaurant_id', invite.restaurant_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember) {
    // Mark invite as accepted anyway
    await supabaseAdmin
      .from('team_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?team_joined=already`,
    );
  }

  // Create the team member
  const { error: insertErr } = await supabaseAdmin
    .from('team_members')
    .insert({
      restaurant_id: invite.restaurant_id,
      user_id: userId,
      role: invite.role,
    });

  if (insertErr) {
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout à l\'équipe. Veuillez réessayer.' },
      { status: 500 },
    );
  }

  // Mark invite as accepted
  await supabaseAdmin
    .from('team_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  // Redirect to dashboard with success indicator
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?team_joined=success`,
  );
}
