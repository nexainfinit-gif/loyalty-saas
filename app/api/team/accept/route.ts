import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { staffLanding } from '@/lib/booking-eligibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── GET /api/team/accept?token=XXX ────────────────────────────────────────
 * Compat : les anciens emails d'invitation pointent vers cette route. L'auth
 * de l'app vit en localStorage (pas en cookies), donc on ne peut PAS accepter
 * côté serveur ici sans provoquer une boucle de login (le cookie n'est pas
 * synchronisé au retour du login). On redirige simplement vers la PAGE CLIENT
 * d'acceptation, qui lit la session localStorage et appelle le POST ci-dessous.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') ?? '';
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  return NextResponse.redirect(`${appUrl}/fr/team/accept?token=${encodeURIComponent(token)}`);
}

/* ── POST /api/team/accept ─────────────────────────────────────────────────
 * Accepte une invitation. Authentifié par TOKEN BEARER (comme le reste de
 * l'app) — fonctionne pour un nouveau staff sans établissement possédé.
 * Body: { token }. Renvoie du JSON ; la page client gère la navigation.
 */
export async function POST(request: Request) {
  // Auth par Bearer token (session localStorage côté client)
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    return NextResponse.json({ error: 'Non authentifié.', needsLogin: true }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(bearer);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Session invalide.', needsLogin: true }, { status: 401 });
  }
  const userId = user.id;
  const userEmail = user.email?.toLowerCase() ?? null;

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'Token d\'invitation manquant.' }, { status: 400 });
  }

  // Lookup invite
  const { data: invite } = await supabaseAdmin
    .from('team_invites')
    .select('id, restaurant_id, email, role, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: 'Invitation introuvable ou invalide.' }, { status: 404 });
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'Cette invitation a déjà été utilisée ou a expiré.' }, { status: 410 });
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await supabaseAdmin.from('team_invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Cette invitation a expiré. Demandez-en une nouvelle.' }, { status: 410 });
  }

  // The logged-in email must match the invite
  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    return NextResponse.json(
      { error: `Cette invitation est destinée à ${invite.email}. Connectez-vous avec cette adresse pour l'accepter.`, wrongEmail: true },
      { status: 403 },
    );
  }

  // Service Booking actif sur l'établissement ? (décide agenda vs scanner)
  const { data: resto } = await supabaseAdmin
    .from('restaurants')
    .select('booking_active')
    .eq('id', invite.restaurant_id)
    .maybeSingle();

  // Déjà membre ? On honore son accès booking existant.
  const { data: existingMember } = await supabaseAdmin
    .from('team_members')
    .select('id, booking_access')
    .eq('restaurant_id', invite.restaurant_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember) {
    await supabaseAdmin.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id);
    const landing = staffLanding(resto?.booking_active, existingMember.booking_access);
    return NextResponse.json({ ok: true, already: true, restaurantId: invite.restaurant_id, landing });
  }

  // Nouveau membre : commerce par défaut (booking_access = false) → scanner.
  const { error: insertErr } = await supabaseAdmin
    .from('team_members')
    .insert({ restaurant_id: invite.restaurant_id, user_id: userId, role: invite.role });

  if (insertErr) {
    return NextResponse.json({ error: 'Erreur lors de l\'ajout à l\'équipe. Réessayez.' }, { status: 500 });
  }

  await supabaseAdmin.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id);

  const landing = staffLanding(resto?.booking_active, false);
  return NextResponse.json({ ok: true, restaurantId: invite.restaurant_id, landing });
}
