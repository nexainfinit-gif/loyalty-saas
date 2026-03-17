import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { Resend } from 'resend';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);
const limiter = rateLimit({ prefix: 'client-auth', limit: 5, windowMs: 300_000 });

const loginSchema = z.object({
  email: z.string().email().max(255),
  slug: z.string().min(1).max(100),
});

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function safeCssColor(c: string): string {
  return /^#[0-9A-Fa-f]{3,6}$/.test(c) ? c : '#4F6BED';
}

/**
 * POST /api/client/auth
 * Sends a magic link email to the client. Creates a client_session token.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 5 minutes.' },
      { status: 429 },
    );
  }

  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
  }

  const { email, slug } = parsed.data;

  // Find restaurant
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color')
    .eq('slug', slug)
    .single();

  if (!restaurant) {
    // Don't reveal whether restaurant exists
    return NextResponse.json({ success: true });
  }

  // Find customer
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, first_name')
    .eq('restaurant_id', restaurant.id)
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!customer) {
    // Don't reveal whether customer exists
    return NextResponse.json({ success: true });
  }

  // Create session (expires in 24h)
  const { data: session } = await supabaseAdmin
    .from('client_sessions')
    .insert({
      restaurant_id: restaurant.id,
      customer_id: customer.id,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }

  // Send magic link email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const loginUrl = `${appUrl}/client/${slug}?token=${session.token}`;
  const safeColor = safeCssColor(restaurant.primary_color ?? '#4F6BED');
  const safeName = esc(restaurant.name);
  const safeFirst = esc(customer.first_name);

  try {
    await resend.emails.send({
      from: `${restaurant.name} <noreply@rebites.be>`,
      to: email,
      subject: `Votre espace client — ${restaurant.name}`,
      html: `
        <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
          <div style="background: ${safeColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
            <h1 style="color: white; margin: 0; font-size: 1.5rem;">Espace client</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">${safeName}</p>
          </div>
          <p style="color: #374151; font-size: 1rem;">Bonjour <strong>${safeFirst}</strong>,</p>
          <p style="color: #374151;">Cliquez sur le bouton ci-dessous pour accéder à votre espace client :</p>
          <div style="text-align: center; margin: 2rem 0;">
            <a href="${loginUrl}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.875rem 2rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
              Accéder à mon espace
            </a>
          </div>
          <div style="background: #f9fafb; border-radius: 12px; padding: 1rem;">
            <p style="margin: 0; color: #6b7280; font-size: 0.85rem; text-align: center;">
              Ce lien est valable 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
            </p>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
          <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
            ${safeName} — Programme de fidélité
          </p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ ctx: 'client/auth', msg: 'Magic link email failed', err: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({ success: true });
}

/**
 * GET /api/client/auth?token=UUID
 * Validates a session token and returns customer + restaurant data.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token manquant.' }, { status: 400 });
  }

  const { data: session } = await supabaseAdmin
    .from('client_sessions')
    .select('customer_id, restaurant_id, expires_at')
    .eq('token', token)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
  }

  // Fetch customer data
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email, total_points, stamps_count, total_visits, last_visit_at, created_at')
    .eq('id', session.customer_id)
    .single();

  // Fetch restaurant data
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color, logo_url')
    .eq('id', session.restaurant_id)
    .single();

  // Fetch loyalty settings
  const { data: loyalty } = await supabaseAdmin
    .from('loyalty_settings')
    .select('program_type, reward_threshold, stamps_total, reward_message')
    .eq('restaurant_id', session.restaurant_id)
    .maybeSingle();

  return NextResponse.json({ customer, restaurant, loyalty });
}
