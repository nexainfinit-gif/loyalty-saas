export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireOwner } from '@/lib/server-auth';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Generate a default SVG circle stamp (no external image needed) */
function defaultCircleSvg(size: number, filled: boolean): Buffer {
  const cx = size / 2;
  const cy = size / 2;
  const r  = cx - 1.5;
  const svg = filled
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
         <circle cx="${cx}" cy="${cy}" r="${r}" fill="white"/>
         <text x="${cx}" y="${cy + size * 0.17}" text-anchor="middle"
           font-family="system-ui, sans-serif"
           font-size="${Math.round(size * 0.42)}"
           font-weight="bold" fill="#4f6bed">✓</text>
       </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
         <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
           stroke="white" stroke-width="2" opacity="0.45"/>
       </svg>`;
  return Buffer.from(svg);
}

/** Fetch an image URL and resize + optionally mask to a circle */
async function fetchStamp(url: string, size: number, round: boolean): Promise<Buffer> {
  const res = await fetch(url, { next: { revalidate: 60 } } as RequestInit);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const raw = Buffer.from(await res.arrayBuffer());

  const resized = await sharp(raw)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  if (!round) return resized;

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
  );
  return sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Parse #rrggbb or 'transparent' into a sharp background colour */
function parseBg(bg: string): { r: number; g: number; b: number; alpha: number } {
  if (!bg || bg === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(bg);
  if (!m) return { r: 0, g: 0, b: 0, alpha: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), alpha: 1 };
}

/* ── Route ────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  // ── Auth: platform owner only ─────────────────────────────────────────────
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(request.url);

    const goal      = clamp(Number(searchParams.get('goal')    ?? '10'), 1, 20);
    const current   = clamp(Number(searchParams.get('current') ?? '0'),  0, goal);
    const columns   = clamp(Number(searchParams.get('columns') ?? '5'),  1, 10);
    const size      = clamp(Number(searchParams.get('size')    ?? '40'), 20, 120);
    const gap       = clamp(Number(searchParams.get('gap')     ?? '8'),  0,  40);
    const round     = searchParams.get('round') !== 'false';
    const bg        = searchParams.get('bg') ?? 'transparent';
    const emptyUrl  = searchParams.get('emptyUrl')  ?? '';
    const filledUrl = searchParams.get('filledUrl') ?? '';

    // ── Stamp image buffers ──────────────────────────────────────────────────
    const [emptyBuf, filledBuf] = await Promise.all([
      emptyUrl  ? fetchStamp(emptyUrl,  size, round) : Promise.resolve(defaultCircleSvg(size, false)),
      filledUrl ? fetchStamp(filledUrl, size, round) : Promise.resolve(defaultCircleSvg(size, true)),
    ]);

    // ── Canvas size ──────────────────────────────────────────────────────────
    const rows   = Math.ceil(goal / columns);
    const totalW = columns * size + Math.max(0, columns - 1) * gap;
    const totalH = rows    * size + Math.max(0, rows    - 1) * gap;

    // ── Compose ──────────────────────────────────────────────────────────────
    const composites: sharp.OverlayOptions[] = [];
    for (let i = 0; i < goal; i++) {
      const row = Math.floor(i / columns);
      const col = i % columns;
      composites.push({
        input: i < current ? filledBuf : emptyBuf,
        left:  col * (size + gap),
        top:   row * (size + gap),
      });
    }

    const png = await sharp({
      create: {
        width:      totalW,
        height:     totalH,
        channels:   4,
        background: parseBg(bg),
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[wallet/stamps]', err);
    return NextResponse.json({ error: 'Erreur de rendu tampons' }, { status: 500 });
  }
}
