// app/api/waitlist/route.ts
//
// Public endpoint consumed by the static marketing site (rebites.be) to
// capture waitlist emails. Cross-origin: the site is on GitHub Pages, the
// API on app.rebites.be — hence the explicit CORS headers + OPTIONS handler.
//
// Resilient by design: the lead is stored in waitlist_leads AND a
// notification email is sent to ADMIN_EMAIL. As long as one of the two
// succeeds, the lead is not lost and the caller gets a success response.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const limiter = rateLimit({ prefix: 'waitlist-ip', limit: 5, windowMs: 60_000 });

const ALLOWED_ORIGINS = new Set([
  'https://rebites.be',
  'https://www.rebites.be',
  'http://localhost:3000',
]);

const schema = z.object({
  email: z.string().trim().email().max(255),
  source: z.string().trim().max(100).optional(),
});

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://rebites.be',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  const ip = getClientIp(req);
  if (!limiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429, headers },
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Format JSON invalide.' }, { status: 400, headers }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400, headers });
  }

  const email = parsed.data.email.toLowerCase();
  const source = parsed.data.source ?? 'rebites.be';

  // 1. Store the lead (unique on email — duplicate = already registered = success)
  let stored = false;
  let duplicate = false;
  const { error: insertError } = await supabaseAdmin
    .from('waitlist_leads')
    .insert({ email, source, ip });

  if (!insertError) {
    stored = true;
  } else if (insertError.code === '23505') {
    stored = true;
    duplicate = true;
  } else {
    logger.error({ ctx: 'waitlist', msg: 'insert failed', err: insertError.message });
  }

  // 2. Notify the admin (skip for duplicates — no need to re-notify)
  let notified = false;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && !duplicate) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Rebites Alertes <noreply@rebites.be>',
        to: adminEmail,
        subject: '🎉 Nouveau lead waitlist Rebites',
        html: `<p>Nouvelle inscription à la liste d'attente :</p>
               <p><strong>${email.replace(/</g, '&lt;')}</strong></p>
               <p style="color:#6b7280;font-size:13px">Source : ${source.replace(/</g, '&lt;')} — ${new Date().toISOString()}</p>`,
      });
      notified = true;
    } catch (err) {
      logger.error({ ctx: 'waitlist', msg: 'admin notification failed', err: err instanceof Error ? err.message : String(err) });
    }
  }

  // Lead is safe if at least one channel worked (duplicates are always "safe")
  if (!stored && !notified) {
    return NextResponse.json(
      { error: 'Une erreur est survenue. Réessayez plus tard.' },
      { status: 500, headers },
    );
  }

  return NextResponse.json({ success: true }, { headers });
}
