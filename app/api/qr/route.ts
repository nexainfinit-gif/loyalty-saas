// app/api/qr/route.ts
//
// QR code auto-hébergé pour les emails (remplace quickchart.io — un domaine
// externe dans nos emails était un signal spam et un tracker de plus).
// GET /api/qr?t=<qr_token> → PNG du QR encodant l'URL de scan du client.
//
// Le contenu encodé est construit CÔTÉ SERVEUR à partir du token (jamais de
// texte arbitraire → pas de générateur de QR public détournable). Réponse
// immuable (le qr_token d'un client ne change pas) → cache CDN un an.

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
// qr.js : dépendance (transitive de react-qr-code) CJS — types déclarés dans
// types/qr-js.d.ts. Import statique pour que le bundler l'embarque au deploy.
import qrFactory from 'qr.js';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const limiter = rateLimit({ prefix: 'qr-image', limit: 60, windowMs: 60_000 });

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const token = req.nextUrl.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{16,64}$/i.test(token)) {
    return NextResponse.json({ error: 'Token invalide.' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.rebites.be';
  const scanUrl = `${appUrl}/api/scan/${token}`;

  const modules = qrFactory(scanUrl).modules;
  const n = modules.length;
  const margin = 4;                                  // zone de silence standard
  const scale = Math.max(4, Math.ceil(250 / n));     // ~250 px de côté
  const size = (n + margin * 2) * scale;

  // Un seul <path> pour tous les modules noirs — SVG compact, rendu net.
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y][x]) d += `M${(x + margin) * scale} ${(y + margin) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${d}" fill="#111111"/></svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
