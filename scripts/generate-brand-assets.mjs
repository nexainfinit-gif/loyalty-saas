// Génération des assets de marque ReBites à partir du tracé SVG validé.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';

const MARK_PATHS = (color) => `
  <g fill="none" stroke="${color}" stroke-width="10">
    <path d="M 15 104 L 15 18 Q 15 8 25 8 L 40 8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 40 8 C 66 8 83 19 83 36 C 83 53 70 62 56 57" stroke-linecap="butt"/>
    <path d="M 63 43 L 42 53 L 57 69 Z" fill="${color}" stroke="none"/>
    <path d="M 37 70 L 73 104" stroke-linecap="round"/>
  </g>`;

// Symbole seul, fond transparent (viewBox 100×110, trait déborde de 5 → marge)
const markSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 -2 95 116" width="380" height="464">${MARK_PATHS(color)}</svg>`;

// Logo complet : symbole + wordmark (police géométrique, pile de secours)
const fullSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 172" width="400" height="344">
  <g transform="translate(53,4) scale(0.86)">${MARK_PATHS(color)}</g>
  <text x="100" y="152" text-anchor="middle" fill="${color}"
        font-family="Poppins, Montserrat, 'Segoe UI', system-ui, sans-serif"
        font-size="34" font-weight="600" letter-spacing="0.5">ReBites</text>
</svg>`;

// Icône carrée : symbole noir centré sur fond blanc (iOS arrondit lui-même)
const iconSvg = (size, pad) => {
  const inner = size - 2 * pad;
  const scale = inner / 116;                    // hauteur du viewBox symbole
  const w = 95 * scale;
  const x = (size - w) / 2 - 5 * scale;         // recentre (viewBox décale de 5)
  const y = pad + 2 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    <g transform="translate(${x},${y}) scale(${scale})">${MARK_PATHS('#111111')}</g>
  </svg>`;
};

mkdirSync('public/brand', { recursive: true });
writeFileSync('public/brand/rebites-mark.svg', markSvg('#111111'));
writeFileSync('public/brand/rebites-mark-blanc.svg', markSvg('#ffffff'));
writeFileSync('public/brand/rebites-logo.svg', fullSvg('#111111'));
writeFileSync('public/brand/rebites-logo-blanc.svg', fullSvg('#ffffff'));

// Icônes PWA — marge ~16 % ; maskable Android — marge 24 % (safe zone)
const png = async (svg, out) => sharp(Buffer.from(svg)).png().toFile(out);
await png(iconSvg(180, 28), 'public/icon-180.png');
await png(iconSvg(192, 30), 'public/icon-192.png');
await png(iconSvg(512, 80), 'public/icon-512.png');
await png(iconSvg(512, 122), 'public/icon-512-maskable.png');

// favicon.ico : conteneur ICO avec entrées PNG 16/32/48 (valide navigateurs modernes)
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((s) => sharp(Buffer.from(iconSvg(s, Math.round(s * 0.08)))).png().toBuffer()),
);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = [];
for (let i = 0; i < sizes.length; i++) {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0);
  e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
}
writeFileSync('app/favicon.ico', Buffer.concat([header, ...entries, ...pngs]));

// Planche de contrôle visuelle
const proof = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420">
  <rect width="900" height="420" fill="#eeeeee"/>
  <rect x="20" y="20" width="200" height="232" fill="#ffffff" rx="12"/>
  <g transform="translate(35,26) scale(1.8)">${MARK_PATHS('#111111')}</g>
  <rect x="250" y="20" width="200" height="232" fill="#16181f" rx="12"/>
  <g transform="translate(265,26) scale(1.8)">${MARK_PATHS('#ffffff')}</g>
  <g transform="translate(480,20)"><rect width="180" height="180" fill="#ffffff" rx="40"/>
    <g transform="translate(24,10) scale(1.4)">${MARK_PATHS('#111111')}</g></g>
  <g transform="translate(480,220) scale(0.5)">
    <rect width="400" height="344" fill="#ffffff" rx="24"/>
    <g transform="translate(153,44) scale(0.86)">${MARK_PATHS('#111111')}</g>
    <text x="200" y="192" text-anchor="middle" fill="#111111" font-family="Poppins, Montserrat, 'Segoe UI', sans-serif" font-size="34" font-weight="600" letter-spacing="0.5">ReBites</text>
  </g>
</svg>`;
await png(proof, process.argv[2]);
console.log('assets générés');
