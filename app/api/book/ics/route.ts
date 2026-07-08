import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildIcs } from '@/lib/ics';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'book-ics', limit: 30, windowMs: 60_000 });

const schema = z.object({
  service:  z.string().trim().min(1).max(120),
  business: z.string().trim().min(1).max(120),
  staff:    z.string().trim().max(120).optional(),
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start:    z.string().regex(/^\d{2}:\d{2}$/),
  end:      z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.string().regex(/^\d{1,3}$/).optional(),
  price:    z.string().max(12).optional(),
});

/**
 * GET /api/book/ics — fichier .ics « Ajouter au calendrier ».
 * Public : ne contient que les infos d'affichage que le client possède déjà
 * (service, salon, horaire — aucune donnée personnelle). Sur iPhone, ouvre la
 * feuille native « Ajouter à Calendrier » (vs l'éditeur desktop Google Agenda,
 * illisible sur mobile).
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(sp);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
  }
  const { service, business, staff, date, start, end, duration, price } = parsed.data;

  const description = [
    `Service : ${service}`,
    ...(staff ? [`Avec : ${staff}`] : []),
    ...(duration ? [`Durée : ${duration} min`] : []),
    ...(price ? [`Prix : ${price}€`] : []),
  ].join('\n');

  const ics = buildIcs({
    title: `${service} — ${business}`,
    description,
    location: business,
    date,
    startTime: start,
    endTime: end,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // inline : iOS affiche la feuille « Ajouter à Calendrier » directement.
      'Content-Disposition': 'inline; filename="rendez-vous.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
