// Génération des assets de marque ReBites depuis logo-source.png (fichier du
// fondateur — rendu sur fond gris dégradé). Pipeline : détourage par seuil de
// luminance (bord progressif), recadrage, séparation symbole/wordmark, puis
// icônes + favicon + variantes noir/blanc transparentes.
// Usage : node scripts/generate-brand-assets.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';

const SRC = 'logo-source.png';
// Luminance : < T_INK = encre pleine ; > T_BG = fond ; entre les deux = dégradé d'alpha
const T_INK = 19, T_BG = 25;

const { data, info } = await sharp(SRC).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// Masque alpha lissé
const alpha = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) {
  const L = data[i];
  alpha[i] = L <= T_INK ? 255 : L >= T_BG ? 0 : Math.round(255 * (T_BG - L) / (T_BG - T_INK));
}
// Plancher : tue le bruit de vignette (halo faible) sans casser l'antialias des bords
for (let i = 0; i < W * H; i++) if (alpha[i] < 35) alpha[i] = 0;

// Solidification : le source est granuleux → l'encre ressort mouchetée.
// Flou léger + recontraste du masque = intérieurs pleins, bords nets.
{
  const smoothed = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } })
    .blur(1.4)
    .linear(2.2, -140)
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  smoothed.copy(alpha);
}

// Détection (bbox, split) : seuil haut = encre franche uniquement — le bruit
// de vignette peut atteindre des alphas moyens près du logo.
const DET = 200;
// Bounding box du contenu
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (alpha[y * W + x] > DET) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}

// Séparation symbole / wordmark : plus grande bande horizontale vide
const rowHasInk = (y) => {
  let run = 0;
  for (let x = minX; x <= maxX; x++) {
    run = alpha[y * W + x] > DET ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
};
let bestGapStart = -1, bestGapLen = 0, gapStart = -1;
for (let y = minY; y <= maxY; y++) {
  if (!rowHasInk(y)) { if (gapStart < 0) gapStart = y; }
  else if (gapStart >= 0) {
    const len = y - gapStart;
    if (len > bestGapLen) { bestGapLen = len; bestGapStart = gapStart; }
    gapStart = -1;
  }
}
const splitY = bestGapStart + Math.floor(bestGapLen / 2);

// Fabrique un PNG RGBA (couleur unie + alpha) recadré sur une zone
const cut = async (x0, y0, x1, y1, rgb) => {
  // resserre la bbox de la zone
  let a = x1, b = y1, c = x0, d = y0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (alpha[y * W + x] > DET) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  }
  const w = c - a + 1, h = d - b + 1;
  if (w <= 0 || h <= 0) throw new Error(`zone vide (${x0},${y0}→${x1},${y1})`);
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2];
    px[o + 3] = alpha[(b + y) * W + (a + x)];
  }
  return { img: sharp(px, { raw: { width: w, height: h, channels: 4 } }), w, h };
};

mkdirSync('public/brand', { recursive: true });
const save = async (zone, rgb, out) => {
  const { img } = await cut(...zone, rgb);
  await img.png().toFile(out);
};
const FULL = [minX, minY, maxX, maxY];
const MARK = [minX, minY, maxX, splitY];
const WORD = [minX, splitY, maxX, maxY];
await save(FULL, [17, 17, 17], 'public/brand/rebites-logo.png');
await save(FULL, [255, 255, 255], 'public/brand/rebites-logo-blanc.png');
await save(MARK, [17, 17, 17], 'public/brand/rebites-mark.png');
await save(MARK, [255, 255, 255], 'public/brand/rebites-mark-blanc.png');
await save(WORD, [17, 17, 17], 'public/brand/rebites-wordmark.png');

// Icônes : symbole noir centré sur fond blanc, marge en %
const icon = async (size, marginPct, out) => {
  const { img, w, h } = await cut(...MARK, [17, 17, 17]);
  const inner = Math.round(size * (1 - 2 * marginPct));
  const scale = Math.min(inner / w, inner / h);
  const rw = Math.round(w * scale), rh = Math.round(h * scale);
  const symbol = await img.resize(rw, rh).png().toBuffer();
  const buf = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: symbol, left: Math.round((size - rw) / 2), top: Math.round((size - rh) / 2) }])
    .png().toBuffer();
  if (out) writeFileSync(out, buf);
  return buf;
};
await icon(180, 0.16, 'public/icon-180.png');
await icon(192, 0.16, 'public/icon-192.png');
await icon(512, 0.16, 'public/icon-512.png');
await icon(512, 0.24, 'public/icon-512-maskable.png');

// favicon.ico : conteneur ICO d'entrées PNG 16/32/48
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) pngs.push(await icon(s, 0.08, null));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = [];
for (let i = 0; i < sizes.length; i++) {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0); e.writeUInt8(sizes[i], 1);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
}
writeFileSync('app/favicon.ico', Buffer.concat([header, ...entries, ...pngs]));

console.log(`ok — bbox ${minX},${minY}→${maxX},${maxY}, split y=${splitY} (gap ${bestGapLen}px)`);
