export const runtime = 'nodejs';

import forge from 'node-forge';
import JSZip from 'jszip';
import sharp from 'sharp';
import crypto from 'crypto';

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
  const color = hexToRgb(input.primaryColor ?? '#4f6bed');

  const base: Record<string, unknown> = {
    formatVersion:       1,
    passTypeIdentifier:  passTypeId,
    serialNumber:        input.serialNumber || input.passId,
    teamIdentifier:      teamId,
    organizationName:    input.restaurantName,
    description:         'Carte de fidélité',
    backgroundColor:     color,
    foregroundColor:     'rgb(255, 255, 255)',
    labelColor:          'rgb(255, 255, 255)',
    logoText:            input.restaurantName,
    // QR barcode — dual format for backward compatibility
    barcode: {
      message:         input.qrToken,
      format:          'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    },
    barcodes: [{
      message:         input.qrToken,
      format:          'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    }],
  };

  const holderField = {
    key:   'holder',
    label: 'CLIENT',
    value: `${input.firstName} ${input.lastName}`.trim(),
  };

  if (input.passKind === 'stamps') {
    const stampsTotal = Number(input.configJson?.stamps_total  ?? 10);
    const rewardMsg   = String(input.configJson?.reward_message ?? 'Récompense offerte');
    base.storeCard = {
      primaryFields:   [{ key: 'stamps',  label: 'TAMPONS',      value: `${input.stampsCount} / ${stampsTotal}` }],
      auxiliaryFields: [holderField, { key: 'reward', label: 'RÉCOMPENSE', value: rewardMsg }],
    };
  } else if (input.passKind === 'points') {
    const threshold = Number(input.configJson?.reward_threshold ?? 100);
    base.storeCard = {
      primaryFields:   [{ key: 'points',  label: 'POINTS',            value: String(input.totalPoints) }],
      auxiliaryFields: [holderField, { key: 'reward', label: 'SEUIL RÉCOMPENSE', value: `${threshold} pts` }],
    };
  } else {
    // event
    const eventName = String(input.configJson?.event_name ?? input.restaurantName);
    const eventDate = String(input.configJson?.event_date ?? '');
    base.eventTicket = {
      primaryFields:   [{ key: 'event', label: 'ÉVÉNEMENT', value: eventName }],
      auxiliaryFields: eventDate ? [{ key: 'date', label: 'DATE', value: eventDate }] : [],
      backFields:      [holderField],
    };
  }

  return Buffer.from(JSON.stringify(base, null, 2), 'utf8');
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

async function fetchOrSolid(
  url:      string | null | undefined,
  width:    number,
  height:   number,
  fallback: string,
): Promise<Buffer> {
  if (url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) } as RequestInit);
      if (res.ok) {
        const raw = Buffer.from(await res.arrayBuffer());
        return sharp(raw)
          .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
      }
    } catch { /* fall through to solid colour */ }
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
  const wwdrPem    = process.env.APPLE_WWDR_PEM             ?? '';

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

  // ── 1. Generate all pass files ─────────────────────────────────────────────
  const [passJson, icon1x, icon2x, icon3x, logo1x, logo2x] = await Promise.all([
    Promise.resolve(buildPassJson(input, passTypeId, teamId)),
    solidSquare(color,  29,  29),   // icon.png       (required)
    solidSquare(color,  58,  58),   // icon@2x.png    (required)
    solidSquare(color,  87,  87),   // icon@3x.png    (recommended)
    fetchOrSolid(input.logoUrl, 160,  50, color),  // logo.png
    fetchOrSolid(input.logoUrl, 320, 100, color),  // logo@2x.png
  ]);

  const files: Record<string, Buffer> = {
    'pass.json':   passJson,
    'icon.png':    icon1x,
    'icon@2x.png': icon2x,
    'icon@3x.png': icon3x,
    'logo.png':    logo1x,
    'logo@2x.png': logo2x,
  };

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
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(buffer.length),
      'Cache-Control':       'no-store, no-cache',
    },
  });
}
