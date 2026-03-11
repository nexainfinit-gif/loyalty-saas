import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

const VALID_ROLES = ['staff', 'restaurant_admin'] as const;
type TeamRole = (typeof VALID_ROLES)[number];

/** Escape HTML special characters. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Validate a CSS hex color; fall back to brand default if malformed. */
function safeCssColor(color: string): string {
  return /^#[0-9A-Fa-f]{3,6}$/.test(color) ? color : '#4F6BED';
}

/* ── GET /api/team ─────────────────────────────────────────────────────── */

/**
 * Returns team members + pending invites for the authenticated restaurant.
 * Auth: restaurant owner only.
 */
export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const [{ data: members, error: mErr }, { data: invites, error: iErr }] =
    await Promise.all([
      supabaseAdmin
        .from('team_members')
        .select('id, user_id, role, created_at')
        .eq('restaurant_id', guard.restaurantId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('team_invites')
        .select('id, email, role, status, created_at, expires_at')
        .eq('restaurant_id', guard.restaurantId)
        .in('status', ['pending'])
        .order('created_at', { ascending: false }),
    ]);

  if (mErr || iErr) {
    return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 });
  }

  // Enrich members with email from auth.users
  const enrichedMembers = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      return {
        ...m,
        email: user?.email ?? null,
      };
    }),
  );

  return NextResponse.json({ members: enrichedMembers, invites: invites ?? [] });
}

/* ── POST /api/team ────────────────────────────────────────────────────── */

/**
 * Send a team invite.
 * Body: { email: string, role?: 'staff' | 'restaurant_admin' }
 * Auth: restaurant owner only.
 */
export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  const { email, role } = body as { email?: string; role?: string };

  // Validate email
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 });
  }
  const cleanEmail = email.trim().toLowerCase();

  // Validate role
  const inviteRole: TeamRole = VALID_ROLES.includes(role as TeamRole)
    ? (role as TeamRole)
    : 'staff';

  // Check for existing pending invite with same email
  const { data: existing } = await supabaseAdmin
    .from('team_invites')
    .select('id')
    .eq('restaurant_id', guard.restaurantId)
    .eq('email', cleanEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'Une invitation est déjà en attente pour cette adresse email.' },
      { status: 409 },
    );
  }

  // Duplicate member check happens at accept time via UNIQUE(restaurant_id, user_id)

  // Create the invite
  const { data: invite, error: insertErr } = await supabaseAdmin
    .from('team_invites')
    .insert({
      restaurant_id: guard.restaurantId,
      email: cleanEmail,
      role: inviteRole,
      invited_by: guard.userId,
    })
    .select('id, token, email, role, status, created_at, expires_at')
    .single();

  if (insertErr || !invite) {
    return NextResponse.json({ error: 'Erreur lors de la création de l\'invitation.' }, { status: 500 });
  }

  // Fetch restaurant info for branded email
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('name, primary_color, color')
    .eq('id', guard.restaurantId)
    .single();

  const restaurantName = restaurant?.name ?? 'Votre restaurant';
  const restaurantColor = safeCssColor(restaurant?.primary_color ?? restaurant?.color ?? '#4F6BED');
  const safeName = esc(restaurantName);
  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/team/accept?token=${invite.token}`;
  const roleLabel = inviteRole === 'restaurant_admin' ? 'Administrateur' : 'Staff';

  // Send invite email via Resend
  try {
    await resend.emails.send({
      from: `${restaurantName} <noreply@rebites.be>`,
      to: cleanEmail,
      subject: `Vous êtes invité(e) à rejoindre ${restaurantName}`,
      html: `
        <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

          <div style="background: ${restaurantColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
            <h1 style="color: white; margin: 0; font-size: 1.5rem;">Invitation</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">${safeName}</p>
          </div>

          <p style="color: #374151; font-size: 1rem;">
            Bonjour,
          </p>

          <p style="color: #374151;">
            Vous avez été invité(e) à rejoindre l'équipe de <strong>${safeName}</strong>
            en tant que <strong>${roleLabel}</strong>.
          </p>

          <div style="text-align: center; margin: 2rem 0;">
            <a href="${acceptUrl}" target="_blank" style="display: inline-block; background: ${restaurantColor}; color: white; text-decoration: none; padding: 0.875rem 2rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
              Accepter l'invitation
            </a>
          </div>

          <div style="background: #f9fafb; border-radius: 12px; padding: 1rem; margin-bottom: 2rem;">
            <p style="margin: 0; color: #6b7280; font-size: 0.85rem; text-align: center;">
              Cette invitation expire dans 7 jours. Si vous n'avez pas de compte,
              vous devrez d'abord en créer un avec cette adresse email.
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

          <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
            ${safeName} — Propulsé par <a href="https://rebites.be" style="color: #9ca3af; text-decoration: underline;">Rebites</a>
          </p>
        </div>
      `,
    });
  } catch {
    // Invite created but email failed — don't rollback, let owner retry or share link manually
  }

  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      created_at: invite.created_at,
      expires_at: invite.expires_at,
    },
  });
}
