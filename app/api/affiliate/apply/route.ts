import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'affiliate-apply', limit: 5, windowMs: 600_000 });

export async function POST(req: NextRequest) {
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Trop de demandes. Réessayez dans quelques minutes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });

  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const phone = (body.phone ?? '').trim() || null;
  const message = (body.message ?? '').trim() || null;

  if (!name || name.length < 2) {
    return NextResponse.json({ error: 'Nom requis (2 caractères minimum).' }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('affiliates')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'active') {
      return NextResponse.json({ error: 'Un compte affilié existe déjà avec cet email.' }, { status: 409 });
    }
    if (existing.status === 'pending') {
      return NextResponse.json({ error: 'Une demande est déjà en cours pour cet email.' }, { status: 409 });
    }
  }

  const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

  const { error } = await supabaseAdmin.from('affiliates').insert({
    name,
    email,
    phone,
    code,
    commission_rate: 20,
    status: 'pending',
    notes: message ? `Candidature: ${message}` : 'Candidature via landing page',
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Un compte existe déjà avec cet email.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur lors de la soumission.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
