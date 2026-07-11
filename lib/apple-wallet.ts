export const runtime = 'nodejs';

import forge from 'node-forge';
import JSZip from 'jszip';
import sharp from 'sharp';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import path from 'path';

// Vercel n'a aucune police système : pointe fontconfig vers la DejaVu embarquée
// (assets/fonts, incluse dans la lambda via outputFileTracingIncludes) pour que
// le texte SVG des strips se rende au lieu d'afficher des carrés.
if (!process.env.FONTCONFIG_PATH) {
  process.env.FONTCONFIG_PATH = path.join(process.cwd(), 'assets', 'fonts');
}

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
  /** Customer referral code (e.g. "A1B2C3") */
  referralCode?: string | null;
  /** Current promo/marketing message — shown on pass back, triggers lock-screen notification via changeMessage */
  promoMessage?: string | null;
  /** Public booking URL (restaurants booking-eligible) — « Réserver » back link */
  bookingUrl?: string | null;
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
  };

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
  const defaultBackFields: Record<string, unknown>[] = [
    { key: 'program', label: 'Programme de fidélité', value: `Carte de fidélité – ${input.restaurantName}` },
    { key: 'terms',   label: 'Conditions',            value: 'Ce pass est personnel et non transférable.' },
  ];

  // Lien « Réserver » — boucle de re-booking dans la poche du client
  // (iOS rend les URLs des back fields cliquables via les data detectors).
  if (input.bookingUrl) {
    defaultBackFields.unshift({
      key:   'booking',
      label: 'Réserver',
      value: `Reprenez rendez-vous en un tap :\n${input.bookingUrl}`,
    });
  }

  // Promo / marketing message — triggers iOS lock-screen notification via changeMessage.
  // Convention : un message préfixé 📅 est un rappel de rendez-vous (écrit par
  // lib/booking-wallet.ts) → label dédié au lieu de « Offre du moment ».
  if (input.promoMessage) {
    defaultBackFields.unshift({
      key:           'promo',
      label:         input.promoMessage.startsWith('📅') ? 'Prochain rendez-vous' : 'Offre du moment',
      value:         input.promoMessage,
      changeMessage: '%@',
    });
  }

  // Auto header: N° parrainage (referral code, or short ID fallback)
  const memberCode = input.referralCode || input.customerId.replace(/-/g, '').slice(-6).toUpperCase();
  const autoHeaderFields = cfgHeaderFields.length > 0
    ? cfgHeaderFields
    : [{ key: 'memberNo', label: 'N°', value: memberCode }];

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
        auxiliaryFields: [{ key: 'remaining', label: 'STATUT', value: 'Récompense disponible 🎉', changeMessage: '%@' }, { key: 'action', label: 'ACTION', value: 'Présentez au comptoir' }, ...cfgAuxiliaryFields],
        backFields:      [...defaultBackFields, ...cfgBackFields],
      };
    } else {
      // ── Normal stamp card ─────────────────────────────────────────────
      storeCard = {
        headerFields:    autoHeaderFields,
        primaryFields:   [],
        secondaryFields: [holderField, { key: 'reward', label: 'RÉCOMPENSE', value: rewardMsg }, ...cfgSecondaryFields],
        auxiliaryFields: [{ key: 'remaining', label: 'RESTANTS', value: `${remaining} tampons`, changeMessage: 'Plus que %@ avant votre récompense !' }, ...cfgAuxiliaryFields],
        backFields:      [...defaultBackFields, ...cfgBackFields],
      };
    }
    base.storeCard = storeCard;
  } else if (input.passKind === 'points') {
    const threshold = Number(cfg.reward_threshold ?? 100);
    const remaining = Math.max(0, threshold - input.totalPoints);
    const rewardMsg = String(cfg.reward_message ?? 'Récompense offerte');

    if (input.rewardPending) {
      // ── Bon à récolter : la carte se transforme (comme les tampons) ────
      // primaryFields vide — Apple rend ce champ PAR-DESSUS le strip festif.
      base.storeCard = {
        headerFields:    [{ key: 'status', label: 'STATUT', value: '🎉 Récompense !' }],
        primaryFields:   [],
        secondaryFields: [holderField, { key: 'reward', label: 'RÉCOMPENSE', value: rewardMsg }, ...cfgSecondaryFields],
        auxiliaryFields: [{ key: 'action', label: 'ACTION', value: 'Présentez au comptoir' }, { key: 'points', label: 'POINTS', value: String(input.totalPoints), changeMessage: 'Votre solde est maintenant de %@ points' }, ...cfgAuxiliaryFields],
        backFields:      [...defaultBackFields, ...cfgBackFields],
      };
      return Buffer.from(JSON.stringify(base, null, 2), 'utf8');
    }

    const storeCard: Record<string, unknown> = {
      headerFields:    autoHeaderFields,
      primaryFields:   [{ key: 'points',  label: 'POINTS',            value: String(input.totalPoints), changeMessage: 'Votre solde est maintenant de %@ points' }],
      secondaryFields: [holderField, { key: 'threshold', label: 'SEUIL RÉCOMPENSE', value: `${threshold} pts` }, ...cfgSecondaryFields],
      auxiliaryFields: [{ key: 'remaining', label: 'RESTANTS', value: `${remaining} points` }, { key: 'reward', label: 'RÉCOMPENSE', value: rewardMsg }, ...cfgAuxiliaryFields],
      backFields:      [...defaultBackFields, ...cfgBackFields],
    };
    base.storeCard = storeCard;
  } else {
    // event — billet d'événement (billetterie Rebites Events)
    const eventName     = String(cfg.event_name ?? input.restaurantName);
    const eventDate     = String(cfg.event_date ?? '');
    const eventTime     = String(cfg.event_time ?? '');
    const eventLocation = String(cfg.event_location ?? '');
    const ticketCode    = String(cfg.ticket_code ?? '');
    const tierLabel     = String(cfg.tier_label ?? '');
    const holderName    = `${input.firstName} ${input.lastName}`.trim();

    base.description = `Billet – ${eventName}`;
    // relevantDate : iOS propose le billet sur l'écran verrouillé à l'heure H.
    if (cfg.relevant_date) base.relevantDate = String(cfg.relevant_date);

    // Quand le strip porte déjà le titre, la date et l'org (strip_title +
    // strip_subtitle + strip_org), on vide les champs redondants pour que
    // le pass reste aussi épuré que le talon web.
    const stripCarriesInfo = !!cfg.strip_title;

    if (cfg.voided) base.voided = true;

    base.eventTicket = {
      headerFields: eventTime ? [{ key: 'time', label: 'HEURE', value: eventTime }] : [],
      primaryFields: stripCarriesInfo ? [] : [{ key: 'event', label: 'ÉVÉNEMENT', value: eventName }],
      secondaryFields: stripCarriesInfo ? [
        ...(tierLabel ? [{ key: 'tier', label: 'CATÉGORIE', value: tierLabel }] : []),
      ] : [
        ...(eventDate ? [{ key: 'date', label: 'DATE', value: eventDate }] : []),
        ...(eventLocation ? [{ key: 'location', label: 'LIEU', value: eventLocation }] : []),
      ],
      auxiliaryFields: [
        ...(holderName ? [{ key: 'holder', label: 'TITULAIRE', value: holderName }] : []),
        ...(!stripCarriesInfo && tierLabel ? [{ key: 'tier', label: 'CATÉGORIE', value: tierLabel }] : []),
      ],
      backFields: [
        ...(ticketCode ? [{ key: 'code', label: 'Code du billet', value: ticketCode }] : []),
        ...(eventDate ? [{ key: 'date', label: 'Date', value: eventDate }] : []),
        ...(eventLocation ? [{ key: 'location', label: 'Lieu', value: eventLocation }] : []),
        { key: 'org',   label: 'Organisateur', value: input.restaurantName },
        { key: 'terms', label: 'Conditions',   value: 'Billet valable une seule fois. Présentez le QR à l\'entrée.' },
        ...cfgBackFields,
      ],
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
  /** Texte en grand gras sur le bon (combiné au visuel custom s'il existe). */
  rewardText?: string;
}): Promise<Buffer> {
  const { width, height, fgColor, stampFilledUrl, stampRound = true, rewardText } = opts;

  if (rewardText && rewardText.trim()) {
    // Texte gras + visuel COMBINÉS : image custom à gauche (si fournie), texte
    // centré dans la zone restante, retour à la ligne auto (max 2 lignes) et
    // taille bornée pour ne jamais déborder du strip.
    const text = rewardText.trim();
    const escSvg = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Visuel à gauche uniquement si une image custom existe (sinon texte seul).
    let visualBuf: Buffer | null = null;
    const visualSize = Math.floor(height * 0.66);
    if (stampFilledUrl) {
      try {
        const res = await fetchWithAutoResign(stampFilledUrl);
        const raw = Buffer.from(await res.arrayBuffer());
        const resized = await sharp(raw)
          .resize(visualSize, visualSize, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
        if (stampRound) {
          const mask = Buffer.from(
            `<svg width="${visualSize}" height="${visualSize}">` +
            `<circle cx="${visualSize / 2}" cy="${visualSize / 2}" r="${visualSize / 2}" fill="white"/></svg>`,
          );
          visualBuf = await sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
        } else {
          visualBuf = resized;
        }
      } catch { /* image indisponible → texte seul */ }
    }

    // Zone de texte : après le visuel (marge 5 %) ou pleine largeur.
    const margin = Math.round(width * 0.05);
    const zoneX = visualBuf ? margin * 2 + visualSize : margin;
    const zoneW = width - zoneX - margin;

    // Découpe en 2 lignes équilibrées si le texte est long.
    const words = text.split(/\s+/);
    let lines: string[] = [text];
    if (text.length > 14 && words.length > 1) {
      let best = 1, bestDiff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ').length;
        const b2 = words.slice(i).join(' ').length;
        const d = Math.abs(a - b2);
        if (d < bestDiff) { bestDiff = d; best = i; }
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }

    // Taille : largeur DejaVu Bold ≈ 0.68 em/caractère, bornes par nb de lignes.
    const maxLen = Math.max(...lines.map((l) => l.length), 1);
    const fs = Math.max(10, Math.floor(Math.min(
      height * (lines.length === 1 ? 0.26 : 0.20),
      zoneW / (0.68 * maxLen),
    )));
    const centerX = zoneX + zoneW / 2;
    const centerY = height / 2;
    const textEls = lines.length === 1
      ? `<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${fs}" fill="${fgColor}">${escSvg(lines[0])}</text>`
      : `<text x="${centerX}" y="${centerY - fs * 0.65}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${fs}" fill="${fgColor}">${escSvg(lines[0])}</text>` +
        `<text x="${centerX}" y="${centerY + fs * 0.65}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${fs}" fill="${fgColor}">${escSvg(lines[1])}</text>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${textEls}</svg>`;
    const textPng = await sharp(Buffer.from(svg)).png().toBuffer();

    const layers: { input: Buffer; left?: number; top?: number }[] = [{ input: textPng, left: 0, top: 0 }];
    if (visualBuf) {
      layers.unshift({ input: visualBuf, left: margin, top: Math.floor((height - visualSize) / 2) });
    }
    return sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(layers).png().toBuffer();
  }

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

/* ── Points progress bar strip ──────────────────────────────────────────────── */

/**
 * Barre de progression graphique pour le mode points (strip Apple Wallet).
 * Le champ primaire « POINTS » est rendu par Apple PAR-DESSUS le strip (en
 * haut à gauche) → la barre occupe le bas de la zone, avec un libellé
 * « X pts avant la récompense » (ou « Récompense disponible ! ») au-dessus.
 * Transparente, aux couleurs du template. Se met à jour à chaque
 * re-téléchargement du pass (donc après chaque push de solde).
 */
async function generateProgressStrip(opts: {
  points:    number;
  threshold: number;
  width:     number;
  height:    number;
  fgColor:   string;
  rewardPending: boolean;
}): Promise<Buffer> {
  const { points, threshold, width, height, fgColor, rewardPending } = opts;
  const ratio = threshold > 0 ? Math.min(1, points / threshold) : 0;
  const full  = rewardPending || ratio >= 1;

  // Barre fine et discrète en bas du strip — AUCUN texte : Vercel n'a pas de
  // polices système (le SVG rendait des carrés), et les chiffres sont déjà
  // affichés par Apple (POINTS / SEUIL / RESTANTS). Le graphique parle seul.
  const barX = width * 0.06;
  const barW = width * 0.88;
  const barH = Math.max(6, Math.round(height * 0.07));
  const barY = Math.round(height * 0.84);
  const r    = barH / 2;
  const fillW = Math.max(full ? barW : barH, barW * ratio); // au moins la pastille

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${r}" fill="${fgColor}" opacity="0.22"/>
  <rect x="${barX}" y="${barY}" width="${fillW}" height="${barH}" rx="${r}" fill="${fgColor}" opacity="0.95"/>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Strip « talon de billet » pour les pass ÉVÉNEMENT — mini-réplique de
 * l'en-tête de la page billet web : label Rebites Events, titre, date/heure
 * + lieu, nom de l'organisateur, perforation, bande papier + code-barres.
 * Tout le texte est rendu DANS l'image (DejaVu embarquée) pour maîtriser
 * la mise en page — les champs Apple sont réduits au strict minimum.
 */
async function generateEventStrip(opts: {
  width:    number;
  height:   number;
  headerBg: string;
  perfo:    string;
  title?:      string;
  titleColor?: string;
  subtitle?:   string;   // "JEU. 16 JUIL. 2026 À 08:51 — LIEU"
  orgName?:    string;   // organisateur
  orgColor?:   string;   // accent
  isVoided?:   boolean;  // tampon "UTILISÉ"
}): Promise<Buffer> {
  const { width, height, headerBg, perfo, title, titleColor = '#FFFFFF',
          subtitle, orgName, orgColor, isVoided } = opts;
  const paper = '#F7F5F0';
  const ink   = '#1C1917';
  const escSvg = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const splitY = Math.round(height * 0.66);
  const notchR = Math.round(height * 0.10);
  const margin = Math.round(width * 0.07);
  const maxW   = width - margin * 2;

  let textSvg = '';

  // Label "REBITES EVENTS" (petit, accent, en haut)
  const labelFs = Math.max(5, Math.round(splitY * 0.11));
  textSvg += `<text x="${margin}" y="${Math.round(splitY * 0.15)}" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${labelFs}" fill="${orgColor || titleColor}" letter-spacing="0.25em">REBITES EVENTS</text>`;

  // Titre (gras, taille auto-ajustée)
  if (title?.trim()) {
    let text = title.trim();
    let fs = Math.round(splitY * 0.38);
    const fitW = (s: string, size: number) => s.length * size * 0.66;
    if (fitW(text, fs) > maxW) fs = Math.max(Math.round(splitY * 0.22), Math.floor(maxW / (text.length * 0.66)));
    if (fitW(text, fs) > maxW) {
      const maxChars = Math.floor(maxW / (fs * 0.66)) - 1;
      text = text.slice(0, Math.max(4, maxChars)) + '…';
    }
    textSvg += `<text x="${margin}" y="${Math.round(splitY * 0.42)}" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${fs}" fill="${titleColor}">${escSvg(text)}</text>`;
  }

  // Sous-titre (date + heure + lieu, petit, semi-transparent)
  if (subtitle?.trim()) {
    let text = subtitle.trim().toUpperCase();
    const subFs = Math.max(5, Math.round(splitY * 0.11));
    const maxChars = Math.floor(maxW / (subFs * 0.62));
    if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…';
    textSvg += `<text x="${margin}" y="${Math.round(splitY * 0.66)}" dominant-baseline="central" font-family="DejaVu Sans" font-size="${subFs}" fill="${titleColor}" opacity="0.65" letter-spacing="0.1em">${escSvg(text)}</text>`;
  }

  // Organisateur (petit, accent)
  if (orgName?.trim()) {
    const orgFs = Math.max(5, Math.round(splitY * 0.11));
    textSvg += `<text x="${margin}" y="${Math.round(splitY * 0.84)}" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${orgFs}" fill="${orgColor || titleColor}" letter-spacing="0.1em">${escSvg(orgName.trim().toUpperCase())}</text>`;
  }

  // Code-barres décoratif (zone papier)
  const pattern = [2, 1, 3, 1, 2, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1];
  const barTop = splitY + Math.round((height - splitY) * 0.28);
  const barH   = Math.round((height - splitY) * 0.46);
  const unit   = Math.max(1, Math.round(width / 340));
  let bars = '';
  let x = Math.round(width * 0.08);
  const xEnd = Math.round(width * 0.92);
  let i = 0;
  while (x < xEnd) {
    const w = pattern[i % pattern.length] * unit;
    bars += `<rect x="${x}" y="${barTop}" width="${w}" height="${barH}" fill="${ink}"/>`;
    x += w + pattern[(i + 7) % pattern.length] * unit;
    i++;
  }

  // Tampon "UTILISÉ" (billet déjà scanné)
  let voidedSvg = '';
  if (isVoided) {
    const stampFs = Math.round(height * 0.20);
    const cx = Math.round(width / 2);
    const cy = Math.round(height * 0.42);
    voidedSvg = `<g transform="rotate(-16, ${cx}, ${cy})">
      <rect x="${cx - stampFs * 2.6}" y="${cy - stampFs * 0.72}" width="${stampFs * 5.2}" height="${stampFs * 1.44}" rx="4" fill="none" stroke="rgba(220,38,38,0.75)" stroke-width="3"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${stampFs}" fill="rgba(220,38,38,0.75)" letter-spacing="0.18em">UTILISE</text>
    </g>`;
  }

  const dash = Math.round(width / 94);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${headerBg}"/>
  <rect y="${splitY}" width="${width}" height="${height - splitY}" fill="${paper}"/>
  <line x1="${notchR + dash}" y1="${splitY}" x2="${width - notchR - dash}" y2="${splitY}"
    stroke="${perfo}" stroke-width="2" stroke-dasharray="${dash} ${dash}"/>
  ${bars}
  ${textSvg}
  <circle cx="0" cy="${splitY}" r="${notchR}" fill="${headerBg}"/>
  <circle cx="${width}" cy="${splitY}" r="${notchR}" fill="${headerBg}"/>
  ${voidedSvg}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
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

/**
 * Icône carrée du pass (icon.png) : le logo du salon centré sur un fond de la
 * couleur du template — c'est CETTE image qu'iOS affiche dans les
 * notifications lockscreen du pass. Repli : carré de couleur unie.
 */
async function fetchIconOrSolid(
  url:      string | null | undefined,
  size:     number,
  fallback: string,
): Promise<Buffer> {
  if (url) {
    try {
      const res = await fetchWithAutoResign(url);
      const raw = Buffer.from(await res.arrayBuffer());
      const c = fallback.replace('#', '').padEnd(6, '0');
      const bg = {
        r: parseInt(c.slice(0, 2), 16) || 0,
        g: parseInt(c.slice(2, 4), 16) || 0,
        b: parseInt(c.slice(4, 6), 16) || 0,
        alpha: 1,
      };
      // Logo à ~78 % de la surface, centré sur le fond couleur (petite marge).
      const inner = Math.round(size * 0.78);
      const logo = await sharp(raw)
        .resize(inner, inner, { fit: 'inside', background: { ...bg, alpha: 0 } })
        .png()
        .toBuffer();
      return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
        .composite([{ input: logo, gravity: 'centre' }])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[pkpass] Failed to fetch icon image:', url, err instanceof Error ? err.message : err);
    }
  }
  return solidSquare(fallback, size, size);
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
  const iconBg = (cfg.iconBgColor as string) || color;
  const iconImageUrl = (cfg.iconImageUrl as string | undefined) || logoImageUrl;

  // Auto-generate stamp grid strip for stamps mode (unless custom strip is set)
  const autoStampStrip = input.passKind === 'stamps' && !stripImageUrl;
  // Strip « talon » auto pour les billets d'événement (aligné sur la page
  // billet web : en-tête thème + perforation + papier code-barres)
  const autoEventStrip = input.passKind === 'event' && !stripImageUrl;
  // Barre de progression auto en mode points (sauf strip custom)
  const autoProgressStrip = input.passKind === 'points' && !stripImageUrl;
  const autoRewardStrip = (input.passKind === 'stamps' || input.passKind === 'points') && !stripImageUrl && input.rewardPending;
  const stampsTotal = Number(cfg.stamps_total ?? 10);
  const stampFilledUrl = (cfg.stampFilledUrl as string) || undefined;
  const stampEmptyUrl  = (cfg.stampEmptyUrl  as string) || undefined;
  const stampRound     = cfg.stampRound !== false;

  // ── 1. Generate all pass files ─────────────────────────────────────────────
  const imagePromises: Promise<Buffer>[] = [
    Promise.resolve(buildPassJson(input, passTypeId, teamId)),
    // Icône de notification configurable à part : image et fond dédiés
    // (cfg.iconImageUrl / cfg.iconBgColor), repli logo + couleur de la carte.
    fetchIconOrSolid(iconImageUrl, 29, iconBg),   // icon.png    (required — affichée dans les notifs)
    fetchIconOrSolid(iconImageUrl, 58, iconBg),   // icon@2x.png (required)
    fetchIconOrSolid(iconImageUrl, 87, iconBg),   // icon@3x.png (recommended)
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
    // Visuel du bon configurable (cfg.rewardImageUrl), repli tampon rempli,
    // puis cercle par défaut.
    const rewardImageUrl = (cfg.rewardImageUrl as string | undefined) || stampFilledUrl;
    const rewardOpts = {
      fgColor: fgHex, stampFilledUrl: rewardImageUrl, stampRound,
      rewardText: (cfg.rewardStripText as string | undefined) || undefined,
    };
    imagePromises.push(
      generateRewardStrip({ ...rewardOpts, width: 375, height: 123 }),
      generateRewardStrip({ ...rewardOpts, width: 750, height: 246 }),
    );
  } else if (autoEventStrip) {
    const eventStripOpts = {
      headerBg:   (cfg.bgColor as string) || color,
      perfo:      (cfg.perfoColor as string) || 'rgba(255,255,255,0.3)',
      title:      (cfg.strip_title as string) || undefined,
      titleColor: fgHex,
      subtitle:   (cfg.strip_subtitle as string) || undefined,
      orgName:    (cfg.strip_org as string) || undefined,
      orgColor:   (cfg.strip_org_color as string) || undefined,
      isVoided:   !!(cfg.voided),
    };
    // eventTicket « strip style » : 375×98 pt (≠ 123 des storeCards)
    imagePromises.push(
      generateEventStrip({ ...eventStripOpts, width: 375, height: 98 }),
      generateEventStrip({ ...eventStripOpts, width: 750, height: 196 }),
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
  } else if (autoProgressStrip) {
    const progressOpts = {
      points: input.totalPoints,
      threshold: Number(cfg.reward_threshold ?? 100),
      fgColor: fgHex,
      rewardPending: input.rewardPending ?? false,
    };
    imagePromises.push(
      generateProgressStrip({ ...progressOpts, width: 375, height: 123 }),
      generateProgressStrip({ ...progressOpts, width: 750, height: 246 }),
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
