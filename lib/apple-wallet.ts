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
    const startIso      = String(cfg.start_iso ?? '');
    const holderName    = `${input.firstName} ${input.lastName}`.trim();
    const isVoided      = !!cfg.voided;

    base.description = `Billet – ${eventName}`;
    // relevantDate : iOS propose le billet sur l'écran verrouillé à l'heure H.
    if (cfg.relevant_date) base.relevantDate = String(cfg.relevant_date);
    // Archivage auto du billet une fois l'événement passé.
    if (cfg.expiration_date) base.expirationDate = String(cfg.expiration_date);
    // Plusieurs billets du même événement s'empilent dans Wallet.
    if (cfg.grouping_id) base.groupingIdentifier = `evt-${cfg.grouping_id}`;
    if (isVoided) base.voided = true;
    base.suppressStripShine = true;

    // Le titre reste un CHAMP Wallet (pas cuit dans le strip) : Apple le pose
    // sur le strip en police SF native, adaptative, jamais recadrée. Les
    // dates passent en ISO + dateStyle/timeStyle : Wallet les rend dans la
    // langue et le fuseau du téléphone.
    base.eventTicket = {
      headerFields: startIso ? [{
        key: 'time', label: 'HEURE', value: startIso,
        dateStyle: 'PKDateStyleNone', timeStyle: 'PKDateStyleShort',
      }] : [],
      primaryFields: [{ key: 'event', label: '✦ REBITES EVENTS', value: eventName }],
      secondaryFields: [
        ...(startIso ? [{ key: 'date', label: 'DATE', value: startIso, dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleShort' }] : []),
        ...(eventLocation ? [{ key: 'location', label: 'LIEU', value: eventLocation, textAlignment: 'PKTextAlignmentRight' }] : []),
      ],
      auxiliaryFields: [
        ...(holderName ? [{ key: 'holder', label: 'TITULAIRE', value: holderName }] : []),
        ...(tierLabel ? [{ key: 'tier', label: 'CATÉGORIE', value: tierLabel }] : []),
        // Le STATUT change au check-in → notification lockscreen (changeMessage)
        { key: 'status', label: 'STATUT', value: isVoided ? 'Déjà utilisé' : 'Valide', changeMessage: 'Billet : %@' },
      ],
      backFields: [
        ...(ticketCode ? [{ key: 'code', label: 'Code du billet', value: ticketCode }] : []),
        ...(eventDate ? [{ key: 'date', label: 'Date', value: `${eventDate}${eventTime ? ` à ${eventTime}` : ''}` }] : []),
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

/** PRNG déterministe (mulberry32) — jitter reproductible, jamais Math.random(). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Étoile à 4 branches ✦ (ornement fantôme du strip). */
function starPath(cx: number, cy: number, R: number): string {
  const d = R * 0.16;
  return `M ${cx} ${cy - R} Q ${cx + d} ${cy - d} ${cx + R} ${cy} Q ${cx + d} ${cy + d} ${cx} ${cy + R} Q ${cx - d} ${cy + d} ${cx - R} ${cy} Q ${cx - d} ${cy - d} ${cx} ${cy - R} Z`;
}

/**
 * Rectangle arrondi au périmètre irrégulier (contour de tampon encreur) :
 * échantillonne le périmètre puis décale chaque point d'un jitter seedé.
 * Centré sur (0,0) — à poser dans un groupe translaté/tourné.
 */
function jitteredRoundedRect(
  w: number, h: number, r: number,
  seed: number, amp: number, step: number,
): string {
  const rnd = mulberry32(seed);
  const hw = w / 2, hh = h / 2;
  const straightW = w - 2 * r, straightH = h - 2 * r, arc = (Math.PI / 2) * r;
  const total = 2 * straightW + 2 * straightH + 4 * arc;
  // Point du périmètre à la distance d (sens horaire depuis le haut-gauche)
  const pointAt = (dist: number): [number, number] => {
    let d = dist % total;
    if (d < straightW) return [-hw + r + d, -hh];
    d -= straightW;
    if (d < arc) { const a = -Math.PI / 2 + d / r; return [hw - r + r * Math.cos(a), -hh + r + r * Math.sin(a)]; }
    d -= arc;
    if (d < straightH) return [hw, -hh + r + d];
    d -= straightH;
    if (d < arc) { const a = d / r; return [hw - r + r * Math.cos(a), hh - r + r * Math.sin(a)]; }
    d -= arc;
    if (d < straightW) return [hw - r - d, hh];
    d -= straightW;
    if (d < arc) { const a = Math.PI / 2 + d / r; return [-hw + r + r * Math.cos(a), hh - r + r * Math.sin(a)]; }
    d -= arc;
    if (d < straightH) return [-hw, hh - r - d];
    d -= straightH;
    const a = Math.PI + d / r;
    return [-hw + r + r * Math.cos(a), -hh + r + r * Math.sin(a)];
  };
  const n = Math.max(24, Math.round(total / step));
  let path = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = pointAt((i / n) * total);
    const jx = x + (rnd() * 2 - 1) * amp;
    const jy = y + (rnd() * 2 - 1) * amp;
    path += `${i === 0 ? 'M' : 'L'} ${jx.toFixed(1)} ${jy.toFixed(1)} `;
  }
  return path + 'Z';
}

/**
 * Strip pour les pass ÉVÉNEMENT — matière SEULE, aucun texte : Apple pose
 * lui-même le champ primaire (label ✦ REBITES EVENTS + titre) sur le strip
 * en police SF native, et peut recadrer l'image. Le strip fournit :
 * même fond que le pass (aucune couture — les bords restent headerBg pur),
 * un modelé très doux (lueur centrale), micro-grain + guillochures quasi
 * subliminales (motif sécurité billet), un ✦ fantôme en trait fin côté
 * droit, la perforation pointillée du talon, et — billet scanné — un vrai
 * tampon encreur « UTILISÉ » : double contour jitteré, encre érodée par
 * masque de turbulence, léger flou, incliné côté droit.
 */
async function generateEventStrip(opts: {
  width:    number;
  height:   number;
  headerBg: string;
  perfo:    string;
  accent?:   string;   // ✦ fantôme (couleur d'accent du thème)
  dark?:     boolean;
  isVoided?: boolean;  // tampon "UTILISÉ"
}): Promise<Buffer> {
  const { width, height, headerBg, perfo, accent, dark = true, isVoided } = opts;

  const margin = Math.round(width * 0.07);
  const perfoY = Math.round(height * 0.93);
  const dash   = Math.round(width / 94);
  const notchR = Math.round(height * 0.07);
  const sw     = Math.max(2, Math.round(height * 0.012));

  const inkTone = dark ? '#FFFFFF' : '#1C1917';
  const guilStep = height * 0.075; // pas des guillochures diagonales

  // Tampon « UTILISÉ » — côté droit, incliné, ne gêne pas le titre (à gauche)
  let voidedSvg = '';
  if (isVoided) {
    const fs = Math.round(height * 0.19);
    const cx = width * 0.725, cy = height * 0.43;
    const stampW = fs * 6.9, stampH = fs * 1.85;
    const outer = jitteredRoundedRect(stampW, stampH, fs * 0.32, 41, height * 0.009, height * 0.042);
    const inner = jitteredRoundedRect(stampW - fs * 0.50, stampH - fs * 0.50, fs * 0.20, 87, height * 0.007, height * 0.05);
    // Masque + flou déclarés dans <defs> ; le groupe externe (non transformé)
    // porte le masque — userSpaceOnUse s'évalue APRÈS le transform sinon.
    voidedSvg = `
  <g mask="url(#inkMask)" opacity="0.88" filter="url(#inkSoft)">
  <g transform="translate(${cx.toFixed(0)}, ${cy.toFixed(0)}) rotate(-11)">
    <path d="${outer}" fill="none" stroke="#D92D20" stroke-width="${(fs * 0.10).toFixed(1)}" stroke-linejoin="round"/>
    <path d="${inner}" fill="none" stroke="#D92D20" stroke-width="${(fs * 0.045).toFixed(1)}" stroke-linejoin="round"/>
    <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans" font-weight="bold" font-size="${fs}" fill="#D92D20" letter-spacing="${(fs * 0.10).toFixed(1)}">UTILISÉ</text>
  </g>
  </g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="lift" cx="0.5" cy="0.42" r="0.85">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="${dark ? 0.045 : 0.35}"/>
      <stop offset="0.75" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <pattern id="guil" width="${guilStep}" height="${guilStep}" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
      <rect width="1" height="${guilStep}" fill="${inkTone}"/>
    </pattern>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 ${dark ? 1 : 0}  0 0 0 0 ${dark ? 1 : 0}  0 0 0 0 ${dark ? 1 : 0}  0.5 0.5 0.5 0 -0.35"/>
    </filter>
    <filter id="inkRough" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="17" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0 0 0 -0.32"/>
    </filter>
    <filter id="inkSoft"><feGaussianBlur stdDeviation="${(height * 0.0028).toFixed(2)}"/></filter>
    <mask id="inkMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
      <rect x="0" y="0" width="${width}" height="${height}" filter="url(#inkRough)"/>
    </mask>
  </defs>
  <rect width="${width}" height="${height}" fill="${headerBg}"/>
  <rect width="${width}" height="${height}" fill="url(#lift)"/>
  <rect width="${width}" height="${height}" fill="url(#guil)" opacity="${dark ? 0.018 : 0.035}"/>
  <rect width="${width}" height="${height}" filter="url(#grain)" opacity="${dark ? 0.05 : 0.06}"/>
  ${accent ? `<path d="${starPath(width * 0.855, height * 0.40, height * 0.30)}" fill="none" stroke="${accent}" stroke-width="${Math.max(1.5, height * 0.011)}" opacity="${isVoided ? 0.05 : 0.13}"/>` : ''}
  <line x1="${margin}" y1="${perfoY}" x2="${width - margin}" y2="${perfoY}"
    stroke="${perfo}" stroke-width="${sw}" stroke-dasharray="${dash} ${dash}"/>
  <circle cx="0" cy="${perfoY}" r="${notchR}" fill="${dark ? 'rgba(0,0,0,0.35)' : 'rgba(28,25,23,0.18)'}"/>
  <circle cx="${width}" cy="${perfoY}" r="${notchR}" fill="${dark ? 'rgba(0,0,0,0.35)' : 'rgba(28,25,23,0.18)'}"/>
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
      headerBg: (cfg.bgColor as string) || color,
      perfo:    (cfg.perfoColor as string) || 'rgba(255,255,255,0.3)',
      accent:   (cfg.strip_accent as string) || undefined,
      dark:     cfg.strip_dark !== false,
      isVoided: !!(cfg.voided),
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
