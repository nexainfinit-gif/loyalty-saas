export const runtime = 'nodejs';

import forge from 'node-forge';
import JSZip from 'jszip';
import sharp from 'sharp';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

/* ── App URL (runtime-safe, avoids Next.js build-time inlining) ─────────────── */

function getAppUrl(): string {
  return process.env['APP_URL'] || 'https://app.rebites.be';
}

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface PassBuildInput {
  /** UUID of the wallet_passes row */
  passId:       string;
  /** Serial number stored in wallet_passes.serial_number (falls back to passId) */
  serialNumber: string;
  /** Template pass kind */
  passKind:     'stamps' | 'points' | 'event';
  /** Template config_json (stamps_total, reward_message, reward_threshold, event_name, event_date …) */
  configJson:   Record<string, unknown>;
  /** Template or restaurant primary colour (#rrggbb) */
  primaryColor?: string | null;
  /** Customer info */
  customerId:   string;
  firstName:    string;
  lastName:     string;
  stampsCount:  number;
  totalPoints:  number;
  qrToken:      string;
  /** Restaurant info */
  restaurantName: string;
  logoUrl?:       string | null;
  /** Authentication token for push updates (min 16 chars, from wallet_passes.authentication_token) */
  authenticationToken?: string | null;
  /** When true, shows a special reward celebration card instead of stamp grid */
  rewardPending?: boolean;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  c = c.padEnd(6, '0');
  const r = parseInt(c.slice(0, 2), 16) || 0;
  const g = parseInt(c.slice(2, 4), 16) || 0;
  const b = parseInt(c.slice(4, 6), 16) || 0;
  return `rgb(${r}, ${g}, ${b})`;
}

function sha1Hex(buf: Buffer): string {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

/* ── pass.json builder ──────────────────────────────────────────────────────── */

function buildPassJson(
  input:      PassBuildInput,
  passTypeId: string,
  teamId:     string,
): Buffer {
  const cfg = input.configJson ?? {};

  // Colors — config_json overrides, then input.primaryColor, then defaults
  const bgColor = hexToRgb(input.primaryColor ?? (cfg.bgColor as string) ?? '#4f6bed');
  const fgColor = cfg.foregroundColor ? hexToRgb(cfg.foregroundColor as string) : 'rgb(255, 255, 255)';
  const lblColor = cfg.labelColor ? hexToRgb(cfg.labelColor as string) : 'rgb(255, 255, 255)';

  // LogoText — config_json override or restaurant name (hidden if showLogoText === false)
  const showLogoText = cfg.showLogoText !== false;
  const logoText = showLogoText ? ((cfg.logoText as string) ?? input.restaurantName) : '';

  // Barcode — format + altText from config_json
  const barcodeFormat = (cfg.barcodeFormat as string) ?? 'PKBarcodeFormatQR';
  const barcodeAltText = cfg.barcodeAltText as string | undefined;
  const barcodeEntry: Record<string, string> = {
    message:         input.qrToken,
    format:          barcodeFormat,
    messageEncoding: 'iso-8859-1',
    ...(barcodeAltText ? { altText: barcodeAltText } : {}),
  };

  // Default altText when none specified
  if (!barcodeAltText) {
    barcodeEntry.altText = 'Présentez ce code au comptoir';
  }

  const base: Record<string, unknown> = {
    formatVersion:       1,
    passTypeIdentifier:  passTypeId,
    serialNumber:        input.serialNumber || input.passId,
    teamIdentifier:      teamId,
    organizationName:    input.restaurantName,
    description:         `Carte de fidélité – ${input.restaurantName}`,
    backgroundColor:     bgColor,
    foregroundColor:     fgColor,
    labelColor:          lblColor,
    logoText,
    // Push update registration — only included when authentication_token is available
    ...(input.authenticationToken ? {
      webServiceURL:       `${getAppUrl()}/api/wallet/webservice`,
      authenticationToken: input.authenticationToken,
    } : {}),
    // Barcode — dual format for backward compatibility
    barcode:  barcodeEntry,
    barcodes: [barcodeEntry],
  };

  // Custom fields from config_json (header, secondary, auxiliary, back)
  const cfgHeaderFields    = Array.isArray(cfg.headerFields)    ? cfg.headerFields as Record<string, string>[]    : [];
  const cfgSecondaryFields = Array.isArray(cfg.secondaryFields) ? cfg.secondaryFields as Record<string, string>[] : [];
  const cfgAuxiliaryFields = Array.isArray(cfg.auxiliaryFields) ? cfg.auxiliaryFields as Record<string, string>[] : [];
  const cfgBackFields      = Array.isArray(cfg.backFields)      ? cfg.backFields as Record<string, string>[]      : [];

  const holderField = {
    key:   'holder',
    label: 'CLIENT',
    value: `${input.firstName} ${input.lastName}`.trim(),
  };

  // Default back fields (CGU, contact) — merged with custom backFields
  const defaultBackFields = [
    { key: 'program', label: 'Programme de fidélité', value: `Carte de fidélité – ${input.restaurantName}` },
    { key: 'terms',   label: 'Conditions',            value: 'Ce pass est personnel et non transférable.' },
  ];

  // Auto header: VISITES (unless user already has custom headerFields)
  const autoHeaderFields = cfgHeaderFields.length > 0
    ? cfgHeaderFields
    : [{ key: 'visits', label: 'VISITES', value: String(input.totalPoints > 0 ? input.totalPoints : input.stampsCount), changeMessage: 'Visites mises à jour : %@' }];

  if (input.passKind === 'stamps') {
    const stampsTotal = Number(cfg.stamps_total  ?? 10);
    const rewardMsg   = String(cfg.reward_message ?? 'Récompense offerte');
    const remaining   = Math.max(0, stampsTotal - input.stampsCount);

    let storeCard: Record<string, unknown>;

    if (input.rewardPending) {
      // ── Special reward card: all stamps filled, awaiting collection ────
      // primaryFields must be empty — Apple renders it ON TOP of the strip image
      storeCard = {
        headerFields:    [{ key: 'status', label: 'STATUT', value: '🎉 Complète !' }],
        primaryFields:   [],
        secondaryFields: [holderField, { key: 'reward', label: 'RÉCOMPENSE', value: rewardMsg }, ...cfgSecondaryFields],
        auxiliaryFields: [{ key: 'action', label: 'ACTION', value: 'Présentez au comptoir' }, ...cfgAuxiliaryFields],
        backFields:      [...defaultBackFields, ...cfgBackFields],
      };
    } else {
      // ── Normal stamp card ─────────────────────────────────────────────
      storeCard = {
        headerFields:    autoHeaderFields,
        primaryFields:   [],
        secondaryFields: [holderField, { key: 'reward', label: 'RÉCOMPENSE', value: rewardMsg }, ...cfgSecondaryFields],
        auxiliaryFields: [{ key: 'remaining', label: 'RESTANTS', value: `${remaining} tampons` }, ...cfgAuxiliaryFields],
        backFields:      [...defaultBackFields, ...cfgBackFields],
      };
    }
    base.storeCard = storeCard;
  } else if (input.passKind === 'points') {
    const threshold = Number(cfg.reward_threshold ?? 100);
    const remaining = Math.max(0, threshold - input.totalPoints);
    const rewardMsg = String(cfg.reward_message ?? 'Récompense offerte');
    const storeCard: Record<string, unknown> = {
      headerFields:    autoHeaderFields,
      primaryFields:   [{ key: 'points',  label: 'POINTS',            value: String(input.totalPoints), changeMessage: 'Votre solde est maintenant de %@ points' }],
      secondaryFields: [holderField, { key: 'threshold', label: 'SEUIL RÉCOMPENSE', value: `${threshold} pts` }, ...cfgSecondaryFields],
      auxiliaryFields: [{ key: 'remaining', label: 'RESTANTS', value: `${remaining} points` }, { key: 'reward', label: 'RÉCOMPENSE', value: rewardMsg }, ...cfgAuxiliaryFields],
      backFields:      [...defaultBackFields, ...cfgBackFields],
    };
    base.storeCard = storeCard;
  } else {
    // event
    const eventName = String(cfg.event_name ?? input.restaurantName);
    const eventDate = String(cfg.event_date ?? '');
    base.eventTicket = {
      primaryFields:   [{ key: 'event', label: 'ÉVÉNEMENT', value: eventName }],
      auxiliaryFields: eventDate ? [{ key: 'date', label: 'DATE', value: eventDate }] : [],
      backFields:      [holderField, ...cfgBackFields],
    };
  }

  return Buffer.from(JSON.stringify(base, null, 2), 'utf8');
}

/* ── Stamp strip generator ──────────────────────────────────────────────────── */

/**
 * Generate a stamp grid as a PNG strip image for Apple Wallet.
 *
 * Renders filled/empty stamps in a 2-row centered layout on a transparent
 * background, sized to fit the Apple Wallet strip area.
 *
 * Uses custom PNG images when provided (stampFilledUrl / stampEmptyUrl),
 * otherwise falls back to default SVG circles with checkmarks.
 */
async function generateStampStrip(opts: {
  filled:         number;
  total:          number;
  width:          number;
  height:         number;
  fgColor:        string;
  stampFilledUrl?: string;
  stampEmptyUrl?:  string;
  stampRound?:     boolean;
}): Promise<Buffer> {
  const { filled, total, width, height, fgColor,
          stampFilledUrl, stampEmptyUrl, stampRound = true } = opts;

  const fg = fgColor.replace('#', '');
  const r = parseInt(fg.slice(0, 2) || 'ff', 16);
  const g = parseInt(fg.slice(2, 4) || 'ff', 16);
  const b = parseInt(fg.slice(4, 6) || 'ff', 16);

  // 2-row layout: ceil/floor split
  const row1Count = Math.ceil(total / 2);
  const row2Count = total - row1Count;
  const maxPerRow = Math.max(row1Count, row2Count);

  // Size stamps to fill the strip with generous spacing
  const gap = Math.max(12, Math.floor(width * 0.03));
  const stampSize = Math.min(
    Math.floor((width * 0.92 - (maxPerRow - 1) * gap) / maxPerRow),
    Math.floor((height - gap * 2) / 2 - 2),
    100,
  );

  // Position grid: centered both horizontally and vertically
  const gridW = maxPerRow * stampSize + (maxPerRow - 1) * gap;
  const gridH = (row2Count > 0 ? 2 : 1) * stampSize + (row2Count > 0 ? gap : 0);
  const offsetX = Math.floor((width - gridW) / 2);
  const offsetY = Math.floor((height - gridH) / 2);

  // ── Prepare stamp images (custom PNG or default SVG) ────────────────────
  async function fetchAndResize(url: string): Promise<Buffer> {
    const res = await fetchWithAutoResign(url);
    const raw = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(raw)
      .resize(stampSize, stampSize, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
    if (!stampRound) return resized;
    const mask = Buffer.from(
      `<svg width="${stampSize}" height="${stampSize}">` +
      `<circle cx="${stampSize / 2}" cy="${stampSize / 2}" r="${stampSize / 2}" fill="white"/></svg>`,
    );
    return sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }

  function defaultSvg(isFilled: boolean): Buffer {
    const cx = stampSize / 2;
    const radius = cx - 2;
    const svg = isFilled
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${stampSize}" height="${stampSize}">
           <circle cx="${cx}" cy="${cx}" r="${radius}" fill="rgb(${r},${g},${b})"/>
           <text x="${cx}" y="${cx + stampSize * 0.15}" text-anchor="middle"
             font-family="system-ui,sans-serif" font-size="${Math.round(stampSize * 0.4)}"
             font-weight="bold" fill="white">✓</text>
         </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${stampSize}" height="${stampSize}">
           <circle cx="${cx}" cy="${cx}" r="${radius}" fill="none"
             stroke="rgb(${r},${g},${b})" stroke-width="2.5" opacity="0.4"/>
         </svg>`;
    return Buffer.from(svg);
  }

  // Pre-fetch custom images once (reuse for all stamps)
  let filledBuf: Buffer;
  let emptyBuf: Buffer;
  try {
    filledBuf = stampFilledUrl ? await fetchAndResize(stampFilledUrl) : defaultSvg(true);
  } catch (err) {
    console.warn('[stamp-strip] Failed to fetch filled stamp image:', stampFilledUrl, err instanceof Error ? err.message : err);
    filledBuf = defaultSvg(true);
  }
  try {
    emptyBuf = stampEmptyUrl ? await fetchAndResize(stampEmptyUrl) : defaultSvg(false);
  } catch (err) {
    console.warn('[stamp-strip] Failed to fetch empty stamp image:', stampEmptyUrl, err instanceof Error ? err.message : err);
    emptyBuf = defaultSvg(false);
  }

  const composites: { input: Buffer; left: number; top: number }[] = [];

  // Row 1 (centered)
  const row1OffsetX = offsetX + Math.floor((gridW - (row1Count * stampSize + (row1Count - 1) * gap)) / 2);
  for (let i = 0; i < row1Count; i++) {
    composites.push({
      input: i < filled ? filledBuf : emptyBuf,
      left:  row1OffsetX + i * (stampSize + gap),
      top:   offsetY,
    });
  }

  // Row 2 (centered)
  if (row2Count > 0) {
    const row2OffsetX = offsetX + Math.floor((gridW - (row2Count * stampSize + (row2Count - 1) * gap)) / 2);
    for (let i = 0; i < row2Count; i++) {
      const idx = row1Count + i;
      composites.push({
        input: idx < filled ? filledBuf : emptyBuf,
        left:  row2OffsetX + i * (stampSize + gap),
        top:   offsetY + stampSize + gap,
      });
    }
  }

  return sharp({
    create: {
      width, height, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/* ── Reward celebration strip ───────────────────────────────────────────────── */

/**
 * Generate a reward celebration strip.
 * Shows a large centered filled stamp image as a "coupon" visual.
 * Falls back to a big golden checkmark circle if no custom image.
 */
async function generateRewardStrip(opts: {
  width: number;
  height: number;
  fgColor: string;
  stampFilledUrl?: string;
  stampRound?: boolean;
}): Promise<Buffer> {
  const { width, height, fgColor, stampFilledUrl, stampRound = true } = opts;
  const fg = fgColor.replace('#', '').padEnd(6, 'f');
  const r = parseInt(fg.slice(0, 2), 16);
  const g = parseInt(fg.slice(2, 4), 16);
  const b = parseInt(fg.slice(4, 6), 16);

  // Large stamp: 75% of strip height, centered
  const stampSize = Math.floor(height * 0.75);
  const cx = Math.floor((width - stampSize) / 2);
  const cy = Math.floor((height - stampSize) / 2);

  let stampBuf: Buffer;
  if (stampFilledUrl) {
    try {
      const res = await fetchWithAutoResign(stampFilledUrl);
      const raw = Buffer.from(await res.arrayBuffer());
      const resized = await sharp(raw)
        .resize(stampSize, stampSize, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
      if (stampRound) {
        const mask = Buffer.from(
          `<svg width="${stampSize}" height="${stampSize}">` +
          `<circle cx="${stampSize / 2}" cy="${stampSize / 2}" r="${stampSize / 2}" fill="white"/></svg>`,
        );
        stampBuf = await sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
      } else {
        stampBuf = resized;
      }
    } catch {
      stampBuf = defaultRewardSvg(stampSize, r, g, b);
    }
  } else {
    stampBuf = defaultRewardSvg(stampSize, r, g, b);
  }

  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: stampBuf, left: cx, top: cy }])
    .png()
    .toBuffer();
}

/** Default reward stamp: golden circle with large checkmark */
function defaultRewardSvg(size: number, r: number, g: number, b: number): Buffer {
  const cx = size / 2;
  const radius = cx - 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cx}" r="${radius}" fill="rgb(${r},${g},${b})"/>
    <circle cx="${cx}" cy="${cx}" r="${radius - 4}" fill="none" stroke="white" stroke-width="2" opacity="0.4"/>
    <text x="${cx}" y="${cx + size * 0.13}" text-anchor="middle"
      font-family="system-ui,sans-serif" font-size="${Math.round(size * 0.45)}"
      font-weight="bold" fill="white">✓</text>
  </svg>`;
  return Buffer.from(svg);
}

/* ── Image helpers ──────────────────────────────────────────────────────────── */

async function solidSquare(
  hexColor: string,
  width:    number,
  height:   number,
): Promise<Buffer> {
  const c = hexColor.replace('#', '').padEnd(6, '0');
  return sharp({
    create: {
      width, height, channels: 3,
      background: {
        r: parseInt(c.slice(0, 2), 16) || 0,
        g: parseInt(c.slice(2, 4), 16) || 0,
        b: parseInt(c.slice(4, 6), 16) || 0,
      },
    },
  }).png().toBuffer();
}

/** Extract Supabase storage path from a signed or public URL */
function extractSupabaseStoragePath(url: string): string | null {
  const signMatch = url.match(/\/storage\/v1\/object\/sign\/([^?]+)/);
  if (signMatch) return signMatch[1];
  const pubMatch = url.match(/\/storage\/v1\/object\/public\/([^?]+)/);
  if (pubMatch) return pubMatch[1];
  return null;
}

/** Fetch URL, auto re-signing expired Supabase signed URLs */
async function fetchWithAutoResign(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) } as RequestInit);
  if (res.ok) return res;
  // If Supabase signed URL expired (400/403), re-sign it
  const fullPath = extractSupabaseStoragePath(url);
  if (fullPath && (res.status === 400 || res.status === 403)) {
    const bucket = fullPath.split('/')[0];
    const filePath = fullPath.split('/').slice(1).join('/');
    const { data: signed } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, 315_360_000);
    if (signed?.signedUrl) {
      const retry = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(5000) } as RequestInit);
      if (retry.ok) return retry;
    }
  }
  throw new Error(`fetch ${res.status}`);
}

async function fetchOrSolid(
  url:      string | null | undefined,
  width:    number,
  height:   number,
  fallback: string,
): Promise<Buffer> {
  if (url) {
    try {
      const res = await fetchWithAutoResign(url);
      const raw = Buffer.from(await res.arrayBuffer());
      return sharp(raw)
        .resize(width, height, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[pkpass] Failed to fetch image:', url, err instanceof Error ? err.message : err);
    }
  }
  return solidSquare(fallback, width, height);
}

/* ── CMS / PKCS#7 signing ───────────────────────────────────────────────────── */

// Cache parsed certificates at module level to avoid re-parsing on every request
let _cachedCert: forge.pki.Certificate | null = null;
let _cachedKey:  forge.pki.PrivateKey   | null = null;
let _cachedWwdr: forge.pki.Certificate  | null = null;

function getCachedCredentials() {
  if (_cachedCert && _cachedKey && _cachedWwdr) {
    return { cert: _cachedCert, pkey: _cachedKey, wwdrCert: _cachedWwdr };
  }

  const certP12B64 = process.env.APPLE_PASS_CERT_P12_BASE64 ?? '';
  const passphrase = process.env.APPLE_PASS_CERT_PASSPHRASE ?? '';
  const wwdrRaw    = process.env.APPLE_WWDR_PEM             ?? '';
  // Accept PEM as-is or base64-encoded (for Vercel env var compatibility)
  const wwdrPem    = wwdrRaw.startsWith('-----') ? wwdrRaw : Buffer.from(wwdrRaw, 'base64').toString('utf-8');

  if (!certP12B64 || !wwdrPem) {
    throw new Error(
      'Apple Wallet: APPLE_PASS_CERT_P12_BASE64 ou APPLE_WWDR_PEM manquant. ' +
      'Configurez ces variables d\'environnement.',
    );
  }

  const p12Der  = forge.util.decode64(certP12B64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];

  const cert = certBags[0]?.cert;
  const pkey = keyBags[0]?.key;

  if (!cert || !pkey) throw new Error('P12: certificat ou clé privée introuvable dans le fichier.');

  const wwdrCert = forge.pki.certificateFromPem(wwdrPem);

  // Log cert expiry for monitoring
  if (cert.validity?.notAfter) {
    const daysUntilExpiry = Math.floor((cert.validity.notAfter.getTime() - Date.now()) / 86400000);
    if (daysUntilExpiry < 60) {
      console.warn(`[Apple Wallet] Certificate expires in ${daysUntilExpiry} days (${cert.validity.notAfter.toISOString()})`);
    }
  }

  _cachedCert = cert;
  _cachedKey  = pkey;
  _cachedWwdr = wwdrCert;

  return { cert, pkey, wwdrCert };
}

/**
 * Returns the Apple Wallet certificate expiry date, or null if the cert
 * is not configured (missing env vars).
 */
export function getCertExpiryDate(): Date | null {
  try {
    const { cert } = getCachedCredentials();
    return cert.validity?.notAfter ?? null;
  } catch {
    return null; // cert not configured
  }
}

function signManifest(manifestBuf: Buffer): Buffer {
  const { cert, pkey, wwdrCert } = getCachedCredentials();

  // Build CMS SignedData
  const p7 = forge.pkcs7.createSignedData();
  // Content: manifest.json bytes (stored as a binary string for forge)
  p7.content = forge.util.createBuffer(manifestBuf.toString('binary'));
  p7.addCertificate(cert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    key:               pkey,
    certificate:       cert,
    digestAlgorithm:   forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });

  // sign() embeds the content in the CMS structure.
  // Apple PassKit accepts both embedded-content and detached signatures.
  p7.sign();

  const derStr = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(derStr, 'binary');
}

/* ── Main builder ───────────────────────────────────────────────────────────── */

/**
 * Assembles and signs a .pkpass bundle for an Apple Wallet pass.
 *
 * Required env vars:
 *   APPLE_PASS_TYPE_IDENTIFIER  – e.g. pass.com.yourcompany.loyalty
 *   APPLE_TEAM_IDENTIFIER       – 10-char Apple Team ID
 *   APPLE_PASS_CERT_P12_BASE64  – Pass Type Certificate as base64-encoded P12/PFX
 *   APPLE_PASS_CERT_PASSPHRASE  – P12 passphrase (can be empty string)
 *   APPLE_WWDR_PEM              – Apple WWDR G4 certificate in PEM format
 */
export async function buildPkpass(input: PassBuildInput): Promise<Buffer> {
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? '';
  const teamId     = process.env.APPLE_TEAM_IDENTIFIER      ?? '';

  if (!passTypeId || !teamId) {
    throw new Error(
      'Apple Wallet: APPLE_PASS_TYPE_IDENTIFIER ou APPLE_TEAM_IDENTIFIER manquant.',
    );
  }

  const color = input.primaryColor ?? '#4f6bed';
  const cfg = input.configJson ?? {};
  const stripImageUrl = cfg.stripImageUrl as string | undefined;
  const logoImageUrl  = (cfg.logoImageUrl as string | undefined) || input.logoUrl;
  const fgHex = (cfg.foregroundColor as string) ?? '#ffffff';

  // Auto-generate stamp grid strip for stamps mode (unless custom strip is set)
  const autoStampStrip = input.passKind === 'stamps' && !stripImageUrl;
  const autoRewardStrip = input.passKind === 'stamps' && !stripImageUrl && input.rewardPending;
  const stampsTotal = Number(cfg.stamps_total ?? 10);
  const stampFilledUrl = (cfg.stampFilledUrl as string) || undefined;
  const stampEmptyUrl  = (cfg.stampEmptyUrl  as string) || undefined;
  const stampRound     = cfg.stampRound !== false;

  // ── 1. Generate all pass files ─────────────────────────────────────────────
  const imagePromises: Promise<Buffer>[] = [
    Promise.resolve(buildPassJson(input, passTypeId, teamId)),
    solidSquare(color,  29,  29),   // icon.png       (required)
    solidSquare(color,  58,  58),   // icon@2x.png    (required)
    solidSquare(color,  87,  87),   // icon@3x.png    (recommended)
    fetchOrSolid(logoImageUrl, 160,  50, color),  // logo.png
    fetchOrSolid(logoImageUrl, 320, 100, color),  // logo@2x.png
  ];

  // Strip image — custom banner OR auto-generated stamp grid
  if (stripImageUrl) {
    imagePromises.push(
      fetchOrSolid(stripImageUrl, 375, 123, color),   // strip.png
      fetchOrSolid(stripImageUrl, 750, 246, color),   // strip@2x.png
    );
  } else if (autoRewardStrip) {
    // Reward pending: large filled stamp centered as "coupon" visual
    const rewardOpts = { fgColor: fgHex, stampFilledUrl, stampRound };
    imagePromises.push(
      generateRewardStrip({ ...rewardOpts, width: 375, height: 123 }),
      generateRewardStrip({ ...rewardOpts, width: 750, height: 246 }),
    );
  } else if (autoStampStrip) {
    const stampOpts = {
      filled: input.stampsCount, total: stampsTotal, fgColor: fgHex,
      stampFilledUrl, stampEmptyUrl, stampRound,
    };
    imagePromises.push(
      generateStampStrip({ ...stampOpts, width: 375, height: 123 }),  // strip.png
      generateStampStrip({ ...stampOpts, width: 750, height: 246 }),  // strip@2x.png
    );
  }

  const results = await Promise.all(imagePromises);
  const [passJson, icon1x, icon2x, icon3x, logo1x, logo2x] = results;

  const files: Record<string, Buffer> = {
    'pass.json':   passJson,
    'icon.png':    icon1x,
    'icon@2x.png': icon2x,
    'icon@3x.png': icon3x,
    'logo.png':    logo1x,
    'logo@2x.png': logo2x,
  };
  if (results.length > 6) {
    files['strip.png']    = results[6];
    files['strip@2x.png'] = results[7];
  }

  // ── 2. manifest.json — SHA-1 hash of every file ────────────────────────────
  const manifest: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) {
    manifest[name] = sha1Hex(buf);
  }
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');

  // ── 3. signature — CMS/PKCS#7 signed manifest ─────────────────────────────
  const signature = signManifest(manifestBuf);

  // ── 4. zip ─────────────────────────────────────────────────────────────────
  const zip = new JSZip();
  for (const [name, buf] of Object.entries(files)) {
    zip.file(name, buf);
  }
  zip.file('manifest.json', manifestBuf);
  zip.file('signature',     signature);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* ── HTTP response helper ───────────────────────────────────────────────────── */

export function pkpassResponse(buffer: Buffer, filename = 'pass.pkpass'): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/vnd.apple.pkpass',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length':      String(buffer.length),
      'Cache-Control':       'no-store, no-cache',
    },
  });
}
