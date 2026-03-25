/* eslint-disable @next/next/no-img-element */
'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'react-qr-code';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { supabase } from '@/lib/supabase';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';

/* ── Types ────────────────────────────────────────────────────────────────── */

interface ImageRow {
  file: string;
  size: string;
  notes: string;
}

interface PassMeta {
  restaurantId:     string | null;
  restaurantName:   string;
  primaryColor:     string;
  logoUrl:          string | null;
  plan:             string;
  programType:      'points' | 'stamps';
  stampsTotal:      number;
  exampleStamps:    number;
  examplePoints:    number;
  rewardThreshold:  number;
  rewardMessage:    string;
  imagesRequired:   ImageRow[];
}

interface PreviewData {
  passJson: object;
  meta:     PassMeta;
}

interface PassField {
  key:   string;
  label: string;
  value: string;
}

type BarcodeFormat = 'PKBarcodeFormatQR' | 'PKBarcodeFormatPDF417' | 'PKBarcodeFormatAztec' | 'PKBarcodeFormatCode128';

/** All fields that drive the live preview */
interface Controls {
  merchantName:   string;
  logoText:       string;
  bgColor:        string;
  foregroundColor: string;
  labelColor:     string;
  // Fields
  stampsTotal:    number;
  currentStamps:  number;
  rewardText:     string;
  headerFields:    PassField[];
  secondaryFields: PassField[];
  auxiliaryFields: PassField[];
  backFields:      PassField[];
  // Barcode
  barcodePayload: string;
  barcodeFormat:  BarcodeFormat;
  barcodeAltText: string;
  // States
  isVip:          boolean;
  // Images
  stripImageUrl:  string;
  logoImageUrl:   string;
  logoSize:       number;
  showLogoText:   boolean;
  // Stamp engine
  stampMode:      'default' | 'custom';
  stampColumns:   number;
  stampSize:      number;
  stampGap:       number;
  stampBg:        string;
  stampRound:     boolean;
  stampEmptyUrl:  string;
  stampFilledUrl: string;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hexToAppleRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 'rgb(79, 107, 237)';
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

function stampGridText(filled: number, total: number): string {
  return Array.from({ length: total }, (_, i) => (i < filled ? '●' : '○')).join(' ');
}

function contrastColor(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const lum = (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000;
  return lum > 128 ? '#000000' : '#ffffff';
}

/** Derives a live pass.json from the current Controls state */
function buildPassJson(c: Controls): object {
  const remaining = Math.max(0, c.stampsTotal - c.currentStamps);

  // Auto header: VISITES (unless user has custom headerFields)
  const autoHeader = c.headerFields.length > 0
    ? c.headerFields
    : [{ key: 'visits', label: 'VISITES', value: String(c.currentStamps), changeMessage: 'Visites mises à jour : %@' }];

  const card: Record<string, unknown> = {
    headerFields: autoHeader,
    primaryFields: [
      { key: 'stamps', label: 'TAMPONS', value: `${c.currentStamps} / ${c.stampsTotal}` },
    ],
    secondaryFields: [
      { key: 'holder', label: 'CLIENT', value: 'Marie Dupont' },
      { key: 'reward', label: 'RÉCOMPENSE', value: c.rewardText },
      ...c.secondaryFields,
    ],
    auxiliaryFields: [
      { key: 'remaining', label: 'RESTANTS', value: `${remaining} tampons` },
      ...c.auxiliaryFields,
    ],
    backFields: [
      { key: 'program', label: 'Programme de fidélité', value: `Carte de fidélité – ${c.merchantName}` },
      { key: 'terms',   label: 'Conditions',            value: 'Ce pass est personnel et non transférable.' },
      ...c.backFields,
    ],
  };

  const altText = c.barcodeAltText || 'Présentez ce code au comptoir';

  return {
    formatVersion:      1,
    passTypeIdentifier: 'pass.YOUR_BUNDLE_ID',
    serialNumber:       'CUSTOMER_UUID',
    teamIdentifier:     'YOUR_TEAM_ID',
    organizationName:   c.merchantName,
    description:        `Carte de fidélité – ${c.merchantName}`,
    backgroundColor:    hexToAppleRgb(c.bgColor),
    foregroundColor:    hexToAppleRgb(c.foregroundColor),
    labelColor:         hexToAppleRgb(c.labelColor),
    logoText:           c.showLogoText ? (c.logoText || c.merchantName) : '',
    storeCard:          card,
    barcode: {
      message:         c.barcodePayload || 'CUSTOMER_QR_TOKEN',
      format:          c.barcodeFormat,
      messageEncoding: 'iso-8859-1',
      altText,
    },
  };
}

function metaToControls(meta: PassMeta): Controls {
  return {
    merchantName:    meta.restaurantName,
    logoText:        meta.restaurantName,
    bgColor:         meta.primaryColor,
    foregroundColor: '#ffffff',
    labelColor:      '#c8d7ff',
    stampsTotal:     meta.stampsTotal,
    currentStamps:   meta.exampleStamps,
    rewardText:      meta.rewardMessage,
    headerFields:    [],
    secondaryFields: [],
    auxiliaryFields: [],
    backFields:      [],
    barcodePayload:  'EXAMPLE_QR_TOKEN',
    barcodeFormat:   'PKBarcodeFormatQR',
    barcodeAltText:  '',
    isVip:           false,
    stripImageUrl:   '',
    logoImageUrl:    meta.logoUrl ?? '',
    logoSize:        36,
    showLogoText:    true,
    stampMode:       'default',
    stampColumns:    5,
    stampSize:       40,
    stampGap:        8,
    stampBg:         'transparent',
    stampRound:      true,
    stampEmptyUrl:   '',
    stampFilledUrl:  '',
  };
}

/** Load controls from an existing template's config_json */
function configJsonToControls(base: Controls, cfg: Record<string, unknown>): Controls {
  return {
    ...base,
    merchantName:    (cfg.merchantName as string) ?? base.merchantName,
    logoText:        (cfg.logoText as string) ?? base.logoText,
    bgColor:         (cfg.bgColor as string) ?? base.bgColor,
    foregroundColor: (cfg.foregroundColor as string) ?? base.foregroundColor,
    labelColor:      (cfg.labelColor as string) ?? base.labelColor,
    rewardText:      (cfg.rewardText as string) ?? base.rewardText,
    headerFields:    Array.isArray(cfg.headerFields) ? cfg.headerFields as PassField[] : base.headerFields,
    secondaryFields: Array.isArray(cfg.secondaryFields) ? cfg.secondaryFields as PassField[] : base.secondaryFields,
    auxiliaryFields: Array.isArray(cfg.auxiliaryFields) ? cfg.auxiliaryFields as PassField[] : base.auxiliaryFields,
    backFields:      Array.isArray(cfg.backFields) ? cfg.backFields as PassField[] : base.backFields,
    barcodeFormat:   (cfg.barcodeFormat as BarcodeFormat) ?? base.barcodeFormat,
    barcodeAltText:  (cfg.barcodeAltText as string) ?? base.barcodeAltText,
    stripImageUrl:   (cfg.stripImageUrl as string) ?? base.stripImageUrl,
    logoImageUrl:    (cfg.logoImageUrl as string) || base.logoImageUrl,
    logoSize:        typeof cfg.logoSize === 'number' ? cfg.logoSize : base.logoSize,
    showLogoText:    typeof cfg.showLogoText === 'boolean' ? cfg.showLogoText : base.showLogoText,
    isVip:           typeof cfg.isVip === 'boolean' ? cfg.isVip : base.isVip,
    stampMode:       (cfg.stampMode as 'default' | 'custom') ?? base.stampMode,
    stampColumns:    typeof cfg.stampColumns === 'number' ? cfg.stampColumns : base.stampColumns,
    stampSize:       typeof cfg.stampSize === 'number' ? cfg.stampSize : base.stampSize,
    stampGap:        typeof cfg.stampGap === 'number' ? cfg.stampGap : base.stampGap,
    stampBg:         (cfg.stampBg as string) ?? base.stampBg,
    stampRound:      typeof cfg.stampRound === 'boolean' ? cfg.stampRound : base.stampRound,
    stampEmptyUrl:   (cfg.stampEmptyUrl as string) ?? base.stampEmptyUrl,
    stampFilledUrl:  (cfg.stampFilledUrl as string) ?? base.stampFilledUrl,
  };
}

/** Build the URL for the server-side stamp grid image */
function buildStampUrl(c: Controls): string {
  const p = new URLSearchParams({
    goal:    String(c.stampsTotal),
    current: String(c.currentStamps),
    columns: String(c.stampColumns),
    size:    String(c.stampSize),
    gap:     String(c.stampGap),
    bg:      c.stampBg,
    round:   String(c.stampRound),
  });
  if (c.stampEmptyUrl)  p.set('emptyUrl',  c.stampEmptyUrl);
  if (c.stampFilledUrl) p.set('filledUrl', c.stampFilledUrl);
  return `/api/wallet/stamps?${p}`;
}

/* ── WalletCard ───────────────────────────────────────────────────────────── */

function WalletCard({ c, stampUrl }: { c: Controls; stampUrl: string }) {
  const { t } = useTranslation();
  const [stampErr, setStampErr] = useState(false);
  useEffect(() => { setStampErr(false); }, [stampUrl]);

  const filled  = Math.min(c.currentStamps, c.stampsTotal);
  const cardBg  = c.bgColor;

  /* Apple Wallet uses SF Pro. Label style = uppercase, ~8pt, tracking wide.
     Value style = ~13pt regular. Header value = ~20pt bold (like N° code). */
  const labelSty: React.CSSProperties = { color: c.labelColor, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontWeight: 500, lineHeight: 1.2 };
  const valueSty: React.CSSProperties = { color: c.foregroundColor, fontSize: 13, fontWeight: 500, lineHeight: 1.3 };
  const headerValSty: React.CSSProperties = { color: c.foregroundColor, fontSize: 20, fontWeight: 700, lineHeight: 1.2 };

  return (
    <div
      className="w-full mx-auto overflow-hidden shadow-2xl select-none"
      style={{ background: cardBg, borderRadius: 13, maxWidth: 340 }}
    >
      {/* ══ LOGO ROW — logo + logoText left, headerFields right ═══════ */}
      <div className="flex items-center justify-between" style={{ padding: '12px 14px 8px' }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {c.logoImageUrl ? (
            <img
              src={c.logoImageUrl}
              alt=""
              className="object-cover flex-shrink-0"
              style={{ width: 44, height: 44, borderRadius: 10 }}
            />
          ) : (
            <div className="flex-shrink-0 flex items-center justify-center font-bold"
                 style={{ color: c.foregroundColor, width: 44, height: 44, borderRadius: 10, backgroundColor: `${c.foregroundColor}22`, fontSize: 18 }}>
              {c.merchantName.charAt(0).toUpperCase()}
            </div>
          )}
          {c.showLogoText && (
            <span className="truncate" style={{ color: c.foregroundColor, fontSize: 18, fontWeight: 700 }}>
              {c.logoText || c.merchantName}
            </span>
          )}
          {c.isVip && (
            <span className="flex-shrink-0 font-bold px-1 py-0.5 rounded"
                  style={{ color: c.foregroundColor, backgroundColor: `${c.foregroundColor}22`, fontSize: 8, letterSpacing: '0.05em' }}>
              VIP
            </span>
          )}
        </div>
        {/* headerFields — Apple puts them top-right (N° member code or custom) */}
        <div className="flex gap-3 flex-shrink-0 ml-2 text-right">
          {(c.headerFields.length > 0 ? c.headerFields : [{ key: 'memberNo', label: 'N°', value: 'A1B2C3' }]).map((f, i) => (
            <div key={i}>
              <p style={labelSty}>{f.label}</p>
              <p style={headerValSty}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ STRIP IMAGE — full width, between logo and primary ════════ */}
      {c.stripImageUrl && (
        <div className="w-full overflow-hidden" style={{ height: 98 }}>
          <img src={c.stripImageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* ══ STAMP STRIP — full-width visual like real Apple Wallet strip ══ */}
      <div style={{ padding: '8px 10px 10px' }}>
        {c.stampMode === 'custom' && stampUrl && !stampErr ? (
          <img
            src={stampUrl}
            alt={`${filled} / ${c.stampsTotal}`}
            onError={() => setStampErr(true)}
            style={{ width: '100%', imageRendering: 'crisp-edges', borderRadius: 6 }}
          />
        ) : (() => {
          // Match real generateStampStrip(): 2-row centered layout, generous sizes
          const row1 = Math.ceil(c.stampsTotal / 2);
          const row2 = c.stampsTotal - row1;
          const maxPerRow = Math.max(row1, row2);
          const stripW = 312; // match real strip width
          const gap = Math.max(10, Math.floor(stripW * 0.03));
          const sz = Math.min(
            Math.floor((stripW * 0.92 - (maxPerRow - 1) * gap) / maxPerRow),
            48,
          );
          const renderStamp = (idx: number) => (
            <div
              key={idx}
              className="flex items-center justify-center"
              style={{
                width: sz, height: sz, borderRadius: '50%',
                border: `2px solid ${idx < filled ? c.foregroundColor : `${c.foregroundColor}40`}`,
                backgroundColor: idx < filled ? c.foregroundColor : 'transparent',
              }}
            >
              {idx < filled && (
                <span style={{ fontSize: sz * 0.4, fontWeight: 700, color: c.bgColor, lineHeight: 1 }}>✓</span>
              )}
            </div>
          );
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: 'center', padding: '6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap }}>
                {Array.from({ length: row1 }, (_, i) => renderStamp(i))}
              </div>
              {row2 > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap }}>
                  {Array.from({ length: row2 }, (_, i) => renderStamp(row1 + i))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ══ FIELDS — CLIENT + RÉCOMPENSE + RESTANTS on one row (like real Apple Wallet) ══ */}
      <div className="flex" style={{ padding: '6px 14px 10px', gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={labelSty}>CLIENT</p>
          <p className="truncate" style={valueSty}>Marie Dupont</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={labelSty}>RÉCOMPENSE</p>
          <p className="truncate" style={valueSty}>{c.rewardText}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={labelSty}>RESTANTS</p>
          <p className="truncate" style={valueSty}>{Math.max(0, c.stampsTotal - filled)} tampons</p>
        </div>
        {c.secondaryFields.map((f, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            <p style={labelSty}>{f.label}</p>
            <p className="truncate" style={valueSty}>{f.value}</p>
          </div>
        ))}
        {c.auxiliaryFields.map((f, i) => (
          <div key={`aux-${i}`} style={{ flex: 1, minWidth: 0 }}>
            <p style={labelSty}>{f.label}</p>
            <p className="truncate" style={valueSty}>{f.value}</p>
          </div>
        ))}
      </div>

      {/* ══ BARCODE — centered, white bg, like real Apple Wallet ══════ */}
      <div className="flex flex-col items-center" style={{ padding: '16px 14px 14px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 10, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <QRCode value={c.barcodePayload || 'EXAMPLE_QR_TOKEN'} size={140} />
        </div>
        <p className="text-center" style={{ color: c.foregroundColor, opacity: 0.5, fontSize: 10, marginTop: 6 }}>
          {c.barcodeAltText || 'Présentez ce code au comptoir'}
        </p>
      </div>
    </div>
  );
}

/* ── PassJsonViewer ───────────────────────────────────────────────────────── */

function PassJsonViewer({ controls }: { controls: Controls }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(buildPassJson(controls), null, 2);

  function copy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('walletPreview.passJsonLabel')}</span>
          <span className="text-[10px] bg-primary-50 text-primary-700 font-semibold px-2 py-0.5 rounded-md">{t('walletPreview.passJsonStoreCard')}</span>
        </div>
        <button
          onClick={copy}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      <pre className="text-[11px] text-gray-700 font-mono p-5 overflow-auto max-h-72 leading-relaxed whitespace-pre">
        {json}
      </pre>
    </div>
  );
}

/* ── Reusable UI components — module scope for stable identity ──────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  colorClass,
}: {
  checked:    boolean;
  onChange:   () => void;
  colorClass: string;
}) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={[
        'relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0',
        checked ? colorClass : 'bg-gray-200',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')}
      />
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
}) {
  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors';
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer p-0.5 flex-shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={e => {
            if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value))
              onChange(e.target.value);
          }}
          maxLength={7}
          className={`${inputCls} font-mono uppercase`}
        />
      </div>
    </Field>
  );
}

/* ── FieldListEditor — add/remove/edit pass fields ─────────────────────── */

function FieldListEditor({
  fields,
  onChange,
  maxFields,
  addLabel,
}: {
  fields:    PassField[];
  onChange:  (fields: PassField[]) => void;
  maxFields: number;
  addLabel:  string;
}) {
  const inputCls = 'w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-400';

  function updateField(idx: number, key: keyof PassField, val: string) {
    const updated = [...fields];
    updated[idx] = { ...updated[idx], [key]: val };
    onChange(updated);
  }

  function addField() {
    if (fields.length >= maxFields) return;
    onChange([...fields, { key: `field_${fields.length + 1}`, label: 'LABEL', value: 'Valeur' }]);
  }

  function removeField(idx: number) {
    onChange(fields.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={f.label}
              onChange={e => updateField(i, 'label', e.target.value)}
              placeholder="Label"
              className={inputCls}
            />
            <input
              type="text"
              value={f.value}
              onChange={e => updateField(i, 'value', e.target.value)}
              placeholder="Valeur"
              className={inputCls}
            />
          </div>
          <button
            onClick={() => removeField(i)}
            className="mt-1 text-xs text-gray-400 hover:text-danger-600 transition-colors flex-shrink-0 w-6 h-6 flex items-center justify-center"
            title="Supprimer"
          >
            ✕
          </button>
        </div>
      ))}
      {fields.length < maxFields && (
        <button
          onClick={addField}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}

/* ── StampUpload ──────────────────────────────────────────────────────────── */

function StampUpload({
  label,
  stampType,
  currentUrl,
  onUpload,
  accessToken,
  restaurantId,
}: {
  label:        string;
  stampType:    'empty' | 'filled';
  currentUrl:   string;
  onUpload:     (url: string) => void;
  accessToken:  string;
  restaurantId: string;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!accessToken) {
      setUploadErr(t('walletPreview.stampUploadLogin'));
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadErr('');
    const form = new FormData();
    form.append('type', stampType);
    form.append('restaurantId', restaurantId);
    form.append('file', file);
    try {
      const res  = await fetch('/api/wallet/stamps/upload', {
        method:  'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body:    form,
      });
      const json = await res.json();
      if (!res.ok) { setUploadErr(json.error ?? t('common.error')); return; }
      onUpload(json.url);
    } catch {
      setUploadErr(t('common.networkError'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const btnCls =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ' +
    'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 cursor-pointer transition-colors';

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2 flex-wrap">
        {currentUrl && (
          <img
            src={currentUrl}
            alt=""
            className="w-9 h-9 rounded-lg object-cover border border-gray-200 flex-shrink-0 bg-gray-100"
          />
        )}
        <label className={btnCls}>
          {uploading ? t('walletPreview.stampUploading') : currentUrl ? t('walletPreview.stampChange') : t('walletPreview.stampAdd')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFile}
            disabled={uploading}
            className="sr-only"
          />
        </label>
        {currentUrl && (
          <button
            onClick={() => onUpload('')}
            className="text-xs text-gray-400 hover:text-danger-600 transition-colors"
            title={t('common.delete')}
          >
            ✕
          </button>
        )}
      </div>
      {uploadErr && <p className="text-[11px] text-danger-600 mt-1">{uploadErr}</p>}
    </div>
  );
}

/* ── getCroppedImg — canvas-based crop helper ────────────────────────── */

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = url;
  });
}

async function getCroppedImg(
  imageSrc: string,
  crop: Area,
  targetWidth: number,
  targetHeight: number,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width  = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, targetWidth, targetHeight,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/png',
      1,
    );
  });
}

/* ── CropModal ───────────────────────────────────────────────────────── */

function CropModal({
  imageSrc,
  aspect,
  targetWidth,
  targetHeight,
  onConfirm,
  onCancel,
}: {
  imageSrc:     string;
  aspect:       number;
  targetWidth:  number;
  targetHeight: number;
  onConfirm:    (blob: Blob) => void;
  onCancel:     () => void;
}) {
  const { t } = useTranslation();
  const [crop, setCrop]   = useState({ x: 0, y: 0 });
  const [zoom, setZoom]   = useState(1);
  const [area, setArea]   = useState<Area | null>(null);
  const [busy, setBusy]   = useState(false);

  const onCropComplete = useCallback((_: Area, croppedArea: Area) => {
    setArea(croppedArea);
  }, []);

  async function handleConfirm() {
    if (!area) return;
    setBusy(true);
    try {
      const blob = await getCroppedImg(imageSrc, area, targetWidth, targetHeight);
      onConfirm(blob);
    } catch {
      onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">{t('walletPreview.cropTitle')}</span>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none">&times;</button>
        </div>

        {/* Crop area */}
        <div className="relative w-full bg-gray-900" style={{ height: 320 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 py-3 flex items-center gap-3 border-t border-gray-100 bg-gray-50">
          <span className="text-[11px] text-gray-500 flex-shrink-0">{t('walletPreview.cropZoom')}</span>
          <input
            type="range" min={1} max={3} step={0.05}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary-600"
          />
        </div>

        {/* Dimensions info */}
        <div className="px-5 py-2 bg-gray-50">
          <p className="text-[11px] text-gray-400">
            {t('walletPreview.cropTargetSize', { w: targetWidth, h: targetHeight })}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !area}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? t('walletPreview.cropProcessing') : t('walletPreview.cropConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ImageUpload — with crop modal ───────────────────────────────────── */

function ImageUpload({
  label,
  hint,
  currentUrl,
  onUpload,
  accessToken,
  restaurantId,
  uploadType,
  cropAspect,
  cropWidth,
  cropHeight,
}: {
  label:        string;
  hint?:        string;
  currentUrl:   string;
  onUpload:     (url: string) => void;
  accessToken:  string;
  restaurantId: string;
  uploadType:   string;
  cropAspect?:  number;
  cropWidth?:   number;
  cropHeight?:  number;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState('');
  const [cropSrc, setCropSrc]       = useState<string | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!accessToken) {
      setUploadErr(t('walletPreview.stampUploadLogin'));
      e.target.value = '';
      return;
    }

    setUploadErr('');
    const objectUrl = URL.createObjectURL(file);

    // If crop dimensions specified, always open cropper
    if (cropAspect && cropWidth && cropHeight) {
      setCropSrc(objectUrl);
      e.target.value = '';
      return;
    }

    // No crop needed — upload directly
    doUpload(file);
    e.target.value = '';
  }

  async function doUpload(fileOrBlob: Blob) {
    setUploading(true);
    setUploadErr('');
    const form = new FormData();
    form.append('type', uploadType);
    form.append('restaurantId', restaurantId);
    form.append('file', fileOrBlob, 'image.png');
    try {
      const res = await fetch('/api/wallet/stamps/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) { setUploadErr(json.error ?? t('common.error')); return; }
      onUpload(json.url);
    } catch {
      setUploadErr(t('common.networkError'));
    } finally {
      setUploading(false);
    }
  }

  function handleCropConfirm(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    doUpload(blob);
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  const btnCls =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ' +
    'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 cursor-pointer transition-colors';

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {currentUrl && (
        <div className="mb-2 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
          <img src={currentUrl} alt="" className="w-full h-auto max-h-24 object-cover" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className={btnCls}>
          {uploading ? t('walletPreview.stampUploading') : currentUrl ? t('walletPreview.stampChange') : t('walletPreview.stampAdd')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileSelect}
            disabled={uploading}
            className="sr-only"
          />
        </label>
        {currentUrl && (
          <button
            onClick={() => onUpload('')}
            className="text-xs text-gray-400 hover:text-danger-600 transition-colors"
          >
            ✕
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
      {uploadErr && <p className="text-[11px] text-danger-600 mt-1">{uploadErr}</p>}

      {/* Crop modal */}
      {cropSrc && cropAspect && cropWidth && cropHeight && (
        <CropModal
          imageSrc={cropSrc}
          aspect={cropAspect}
          targetWidth={cropWidth}
          targetHeight={cropHeight}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}

/* ── Section — collapsible card ───────────────────────────────────────── */

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title:       string;
  children:    React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── TemplateSaver ────────────────────────────────────────────────────────── */

interface TemplateOption {
  id:          string;
  name:        string;
  pass_kind:   string;
  config_json: Record<string, unknown> | null;
}

function controlsToConfigJson(c: Controls): Record<string, unknown> {
  return {
    merchantName:    c.merchantName,
    logoText:        c.logoText,
    bgColor:         c.bgColor,
    foregroundColor: c.foregroundColor,
    labelColor:      c.labelColor,
    stampsTotal:     c.stampsTotal,
    rewardText:      c.rewardText,
    headerFields:    c.headerFields,
    secondaryFields: c.secondaryFields,
    auxiliaryFields: c.auxiliaryFields,
    backFields:      c.backFields,
    barcodeFormat:   c.barcodeFormat,
    barcodeAltText:  c.barcodeAltText,
    stripImageUrl:   c.stripImageUrl,
    logoImageUrl:    c.logoImageUrl,
    showLogoText:    c.showLogoText,
    isVip:           c.isVip,
    stampMode:       c.stampMode,
    stampColumns:    c.stampColumns,
    stampSize:       c.stampSize,
    stampGap:        c.stampGap,
    stampBg:         c.stampBg,
    stampRound:      c.stampRound,
    stampEmptyUrl:   c.stampEmptyUrl,
    stampFilledUrl:  c.stampFilledUrl,
  };
}

function TemplateSaver({
  controls,
  defaults,
  accessToken,
  restaurantId,
  onLoadTemplate,
  initialTemplateId,
}: {
  controls:       Controls;
  defaults:       Controls;
  accessToken:    string;
  restaurantId:   string;
  onLoadTemplate: (cfg: Record<string, unknown>) => void;
  initialTemplateId?: string | null;
}) {
  const { t } = useTranslation();
  const [templates, setTemplates]   = useState<TemplateOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [feedback, setFeedback]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [newName, setNewName]       = useState('');
  const [mode, setMode]             = useState<'apply' | 'create'>('apply');

  useEffect(() => {
    if (!accessToken || !restaurantId) return;
    setLoadingList(true);
    fetch(`/api/admin/wallet/templates?restaurantId=${restaurantId}`)
      .then(r => r.json())
      .then(json => {
        if (json.templates) {
          setTemplates(json.templates.map((t: any) => ({
            id: t.id, name: t.name, pass_kind: t.pass_kind,
            config_json: t.config_json ?? null,
          })));
          // Auto-select the template from ?templateId if provided
          const hasInitial = initialTemplateId && json.templates.some((t: any) => t.id === initialTemplateId);
          if (hasInitial) {
            setSelectedId(initialTemplateId);
          } else if (json.templates.length > 0) {
            setSelectedId(json.templates[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [accessToken, restaurantId]);

  function clearFeedback() {
    setTimeout(() => setFeedback(null), 4000);
  }

  async function handleApply() {
    if (!selectedId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/wallet/templates/${selectedId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primary_color: controls.bgColor,
          config_json:   controlsToConfigJson(controls),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', msg: json.error ?? t('walletPreview.applyError') });
      } else {
        setFeedback({ type: 'success', msg: t('walletPreview.applied') });
        // Update local list
        setTemplates(prev => prev.map(tp =>
          tp.id === selectedId ? { ...tp, config_json: controlsToConfigJson(controls) } : tp
        ));
      }
    } catch {
      setFeedback({ type: 'error', msg: t('common.networkError') });
    } finally {
      setSaving(false);
      clearFeedback();
    }
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setFeedback({ type: 'error', msg: t('walletPreview.nameRequired') });
      clearFeedback();
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/wallet/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          name:          newName.trim(),
          pass_kind:     'stamps',
          primary_color: controls.bgColor,
          config_json:   controlsToConfigJson(controls),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', msg: json.error ?? t('walletPreview.createError') });
      } else {
        setFeedback({ type: 'success', msg: t('walletPreview.created') });
        if (json.template) {
          const newTpl = {
            id: json.template.id, name: json.template.name,
            pass_kind: json.template.pass_kind,
            config_json: controlsToConfigJson(controls),
          };
          setTemplates(prev => [newTpl, ...prev]);
          setSelectedId(json.template.id);
          setNewName('');
          setMode('apply');
        }
      }
    } catch {
      setFeedback({ type: 'error', msg: t('common.networkError') });
    } finally {
      setSaving(false);
      clearFeedback();
    }
  }

  function handleLoad() {
    const tpl = templates.find(tp => tp.id === selectedId);
    if (tpl?.config_json) {
      onLoadTemplate(tpl.config_json);
      setFeedback({ type: 'success', msg: t('walletPreview.templateLoaded') });
      clearFeedback();
    }
  }

  if (!accessToken || !restaurantId) return null;

  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">

      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('walletPreview.saveTitle')}</span>
      </div>

      <div className="flex border-b border-gray-100">
        {([['apply', t('walletPreview.tabApply')], ['create', t('walletPreview.tabNew')]] as [string, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key as 'apply' | 'create')}
            className={[
              'flex-1 py-2.5 text-xs font-semibold transition-colors',
              mode === key
                ? 'text-primary-700 border-b-2 border-primary-600 -mb-px bg-white'
                : 'text-gray-400 hover:text-gray-600',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">

        {mode === 'apply' && (
          <>
            <Field label={t('walletPreview.templateSelect')}>
              {loadingList ? (
                <p className="text-xs text-gray-400">{t('walletPreview.loadingTemplates')}</p>
              ) : templates.length === 0 ? (
                <p className="text-xs text-gray-400">{t('walletPreview.noTemplateAvailable')}</p>
              ) : (
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className={inputCls}
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </Field>

            <div className="flex gap-2">
              <button
                onClick={handleLoad}
                disabled={!selectedId || templates.length === 0}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('walletPreview.loadTemplateBtn')}
              </button>
              <button
                onClick={handleApply}
                disabled={saving || !selectedId || templates.length === 0}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? t('walletPreview.applyUpdating') : t('walletPreview.applyToTemplateBtn')}
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <Field label={t('walletPreview.templateNameLabel')}>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('walletPreview.templatePlaceholder')}
                className={inputCls}
              />
            </Field>

            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="w-full bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? t('walletPreview.creating') : t('walletPreview.createTemplateBtn')}
            </button>
          </>
        )}

        {feedback && (
          <div className={[
            'text-xs font-medium px-3 py-2 rounded-xl border',
            feedback.type === 'success'
              ? 'bg-success-50 border-success-200 text-success-700'
              : 'bg-danger-50 border-danger-200 text-danger-700',
          ].join(' ')}>
            {feedback.msg}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function WalletPreviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-ds-spin" />
      </div>
    }>
      <WalletPreviewInner />
    </Suspense>
  );
}

function WalletPreviewInner() {
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const initialTemplateId = searchParams.get('templateId');
  const { t } = useTranslation();
  const [data, setData]         = useState<PreviewData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [controls, setControls]   = useState<Controls | null>(null);
  const [defaults, setDefaults]   = useState<Controls | null>(null);
  const [stampUrl, setStampUrl]   = useState('');
  const [accessToken, setToken]   = useState('');
  const [preloadTemplateId, setPreloadTemplateId] = useState<string | null>(initialTemplateId);
  const [restaurants, setRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [merchantMode, setMerchantMode] = useState<'restaurant' | 'draft'>('restaurant');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('');

  // Debounce stamp URL
  useEffect(() => {
    if (!controls || controls.stampMode !== 'custom') {
      setStampUrl('');
      return;
    }
    const t = setTimeout(() => setStampUrl(buildStampUrl(controls)), 300);
    return () => clearTimeout(t);
  }, [
    controls?.stampMode,
    controls?.stampsTotal, controls?.currentStamps,
    controls?.stampColumns, controls?.stampSize, controls?.stampGap,
    controls?.stampBg, controls?.stampRound,
    controls?.stampEmptyUrl, controls?.stampFilledUrl,
  ]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      let url: string;
      let headers: Record<string, string> = {};

      if (session) {
        setToken(session.access_token);
        url     = '/api/wallet/preview';
        headers = { Authorization: `Bearer ${session.access_token}` };
      } else if (process.env.NODE_ENV !== 'production') {
        url = '/api/wallet/preview?demo=1';
      } else {
        router.replace('/dashboard/login');
        return;
      }

      fetch(url, { headers })
        .then(async (r) => {
          if (r.status === 401) throw Object.assign(new Error('401'), { is401: true });
          return r.json();
        })
        .then((json) => {
          if (json.error) { setError(json.error); return; }
          setData(json);
          const initial = metaToControls(json.meta);
          setControls(initial);
          setDefaults(initial);
        })
        .catch((err: any) => {
          setError(err.is401 ? '__401__' : t('walletPreview.networkError'));
        })
        .finally(() => setLoading(false));
    });
  }, [router, t]);

  // Fetch all restaurants for the merchant selector
  useEffect(() => {
    fetch('/api/admin/restaurants?filter=all&sort=name&order=asc')
      .then(r => r.json())
      .then(json => {
        const list = (json.restaurants ?? []).map((r: { id: string; name: string }) => ({
          id: r.id, name: r.name,
        }));
        setRestaurants(list);
      })
      .catch(() => {});
  }, []);

  // When data loads, auto-select the current restaurant
  useEffect(() => {
    if (data?.meta.restaurantId && restaurants.length > 0) {
      setSelectedRestaurantId(data.meta.restaurantId);
    }
  }, [data?.meta.restaurantId, restaurants]);

  // Switch restaurant: reload preview meta (logo, color, name, etc.)
  const handleRestaurantSwitch = useCallback(async (restaurantId: string) => {
    if (!accessToken || !restaurantId) return;
    setSelectedRestaurantId(restaurantId);
    try {
      const res = await fetch(`/api/wallet/preview?restaurantId=${restaurantId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      const fresh = metaToControls(json.meta);
      setControls(fresh);
      setDefaults(fresh);
    } catch { /* ignore */ }
  }, [accessToken]);

  const handleChange = useCallback(<K extends keyof Controls>(key: K, val: Controls[K]) => {
    setControls(prev => prev ? { ...prev, [key]: val } : prev);
  }, []);

  function handleReset() {
    setControls(defaults);
  }

  const handleLoadTemplate = useCallback((cfg: Record<string, unknown>) => {
    setControls(prev => {
      if (!prev) return prev;
      return configJsonToControls(prev, cfg);
    });
  }, []);

  /* ── Auto-load template from ?templateId query param ───────────────── */
  useEffect(() => {
    if (!preloadTemplateId || !accessToken || loading) return;

    (async () => {
      try {
        // 1. Fetch all templates via admin API (cross-restaurant)
        const tmplRes = await fetch('/api/admin/wallet/templates', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const tmplJson = await tmplRes.json();
        const templates = tmplJson.templates ?? [];
        const target = templates.find((t: { id: string }) => t.id === preloadTemplateId);
        if (!target) { setPreloadTemplateId(null); return; }

        // 2. Always reload preview meta for the template's restaurant
        //    This ensures logo, color, name, loyalty settings match the right restaurant
        const templateRid = target.restaurant_id;
        if (templateRid) {
          const previewRes = await fetch(`/api/wallet/preview?restaurantId=${templateRid}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (previewRes.ok) {
            const previewJson = await previewRes.json();
            setData(previewJson);
            setSelectedRestaurantId(templateRid);
            const freshBase = metaToControls(previewJson.meta);
            const merged = target.config_json
              ? configJsonToControls(freshBase, target.config_json)
              : freshBase;
            setControls(merged);
            setDefaults(freshBase);
          }
        }
      } catch { /* ignore */ }
      setPreloadTemplateId(null);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadTemplateId, accessToken, loading]);

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-ds-spin mx-auto mb-4" />
        <p className="text-sm text-gray-400 font-medium">{t('walletPreview.loading')}</p>
      </div>
    </div>
  );

  /* ── Error ────────────────────────────────────────────────────────────── */
  if (error || !data || !controls || !defaults) {
    const is401 = error === '__401__';
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] text-center max-w-sm w-full">
          {is401 ? (
            <>
              <p className="text-gray-900 font-semibold mb-1">{t('walletPreview.loginRequired')}</p>
              <p className="text-sm text-gray-500 mb-5">
                {t('walletPreview.loginRequiredDesc')}
              </p>
              <button
                onClick={() => router.push('/dashboard/login')}
                className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                {t('walletPreview.loginBtn')}
              </button>
            </>
          ) : (
            <>
              <p className="text-danger-600 font-semibold mb-2">{t('walletPreview.errorTitle')}</p>
              <p className="text-sm text-gray-500">{error || t('walletPreview.errorDefault')}</p>
              <button
                onClick={() => router.push('/admin/wallet')}
                className="mt-5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
              >
                {t('walletPreview.backDashboard')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors';
  const isDirty  = JSON.stringify(controls) !== JSON.stringify(defaults);
  const rid      = data.meta.restaurantId ?? '';

  return (
    <div className="min-h-screen bg-surface">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 h-14 flex items-center px-6 gap-4 shadow-[0_1px_0_rgba(17,24,39,0.04)]">
        <button
          onClick={() => router.push('/admin/wallet')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('admin.walletBack')}
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-sm font-semibold text-gray-900">{t('walletPreview.pageTitle')}</h1>
        <div className="flex-1" />
        <button
          onClick={handleReset}
          disabled={!isDirty}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
        >
          {t('walletPreview.resetBtn')}
        </button>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Info banner */}
        <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex items-start gap-3 mb-8">
          <span className="text-primary-600 mt-0.5 flex-shrink-0">i</span>
          <p className="text-xs text-primary-700 leading-relaxed">
            {t('walletPreview.infoBannerConfigurator', { name: controls.merchantName })}
          </p>
        </div>

        {/* 2-column layout: preview (left, sticky) | config (right, scroll) */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 items-start">

          {/* ── Left — Sticky preview ────────────────────────────────────── */}
          <div className="lg:sticky lg:top-20 space-y-6">

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('walletPreview.cardPreview')}</p>
              <WalletCard c={controls} stampUrl={stampUrl} />
              <p className="text-[10px] text-gray-400 mt-2 text-center leading-relaxed">{t('walletPreview.previewDisclaimer')}</p>
            </div>

            {/* Field legend */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-xs font-semibold text-gray-700 mb-3">{t('walletPreview.fieldMapping')}</p>
              <div className="space-y-2 text-[11px] text-gray-500">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">backgroundColor</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: controls.bgColor }} />
                    <span className="font-mono text-gray-600">{controls.bgColor}</span>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">foregroundColor</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: controls.foregroundColor }} />
                    <span className="font-mono text-gray-600">{controls.foregroundColor}</span>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">labelColor</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: controls.labelColor }} />
                    <span className="font-mono text-gray-600">{controls.labelColor}</span>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">barcode.format</span>
                  <span className="font-mono text-gray-600 text-[10px]">{controls.barcodeFormat.replace('PKBarcodeFormat', '')}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">headerFields</span>
                  <span className="font-mono text-gray-600">{controls.headerFields.length > 0 ? controls.headerFields.length : '1 (auto)'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">secondaryFields</span>
                  <span className="font-mono text-gray-600">{controls.secondaryFields.length + 2}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">auxiliaryFields</span>
                  <span className="font-mono text-gray-600">{controls.auxiliaryFields.length + 1}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">backFields</span>
                  <span className="font-mono text-gray-600">{controls.backFields.length + 2}</span>
                </div>
                {controls.stripImageUrl && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">strip.png</span>
                    <span className="font-mono text-success-600 text-[10px]">375×123</span>
                  </div>
                )}
              </div>
            </div>

            {/* pass.json */}
            <PassJsonViewer controls={controls} />
          </div>

          {/* ── Right — Configuration sections ───────────────────────────── */}
          <div className="space-y-5">

            {/* ── Carte ──────────────────────────────────────────────────── */}
            <Section title={t('walletPreview.sectionCard')}>
              <Field label={t('walletPreview.fieldMerchantName')}>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setMerchantMode('restaurant')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      merchantMode === 'restaurant'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    Commerce existant
                  </button>
                  <button
                    type="button"
                    onClick={() => setMerchantMode('draft')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      merchantMode === 'draft'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    Brouillon
                  </button>
                </div>
                {merchantMode === 'restaurant' ? (
                  <select
                    value={selectedRestaurantId}
                    onChange={e => handleRestaurantSwitch(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Sélectionner un commerce —</option>
                    {restaurants.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={controls.merchantName}
                    onChange={e => handleChange('merchantName', e.target.value)}
                    placeholder="Nom du commerce (brouillon)"
                    className={inputCls}
                  />
                )}
              </Field>

              {/* Logo */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <p className="text-xs font-medium text-gray-500">{t('walletPreview.logoSectionTitle')}</p>
                <ImageUpload
                  label={t('walletPreview.fieldLogoImage')}
                  hint={t('walletPreview.logoImageHint')}
                  currentUrl={controls.logoImageUrl}
                  onUpload={url => handleChange('logoImageUrl', url)}
                  accessToken={accessToken}
                  restaurantId={rid}
                  uploadType="logo"
                  cropAspect={1}
                  cropWidth={200}
                  cropHeight={200}
                />
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <span className="text-gray-400 text-xs mt-px flex-shrink-0">i</span>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{t('walletPreview.logoSizeNote')}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700">{t('walletPreview.showLogoTextLabel')}</p>
                    <p className="text-[11px] text-gray-400">{t('walletPreview.showLogoTextDesc')}</p>
                  </div>
                  <Toggle checked={controls.showLogoText} onChange={() => handleChange('showLogoText', !controls.showLogoText)} colorClass="bg-primary-600" />
                </div>
                {controls.showLogoText && (
                  <Field label={t('walletPreview.fieldLogoText')}>
                    <input type="text" value={controls.logoText} onChange={e => handleChange('logoText', e.target.value)} placeholder={controls.merchantName} className={inputCls} />
                  </Field>
                )}
              </div>

              {/* Strip image */}
              <div className="border-t border-gray-100 pt-4">
                <ImageUpload
                  label={t('walletPreview.fieldStripImage')}
                  hint={t('walletPreview.stripImageHint')}
                  currentUrl={controls.stripImageUrl}
                  onUpload={url => handleChange('stripImageUrl', url)}
                  accessToken={accessToken}
                  restaurantId={rid}
                  uploadType="strip"
                  cropAspect={750 / 246}
                  cropWidth={750}
                  cropHeight={246}
                />
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700">{t('walletPreview.stateVip')}</p>
                    <p className="text-[11px] text-gray-400">{t('walletPreview.stateVipDesc')}</p>
                  </div>
                  <Toggle checked={controls.isVip} onChange={() => handleChange('isVip', !controls.isVip)} colorClass="bg-vip-600" />
                </div>
              </div>
            </Section>

            {/* ── Couleurs ───────────────────────────────────────────────── */}
            <Section title={t('walletPreview.sectionColors')}>
              <ColorPicker label={t('walletPreview.fieldBgColor')} value={controls.bgColor} onChange={v => handleChange('bgColor', v)} />
              <ColorPicker label={t('walletPreview.fieldFgColor')} value={controls.foregroundColor} onChange={v => handleChange('foregroundColor', v)} />
              <ColorPicker label={t('walletPreview.fieldLabelColor')} value={controls.labelColor} onChange={v => handleChange('labelColor', v)} />
            </Section>

            {/* ── Progression ────────────────────────────────────────────── */}
            <Section title={t('walletPreview.sectionProgression')}>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('walletPreview.fieldStampsGoal')}>
                  <input
                    type="number" min={1} max={20}
                    value={controls.stampsTotal}
                    onChange={e => {
                      const v = clamp(Number(e.target.value), 1, 20);
                      handleChange('stampsTotal', v);
                      if (controls.currentStamps > v) handleChange('currentStamps', v);
                    }}
                    className={inputCls}
                  />
                </Field>
                <Field label={t('walletPreview.fieldCurrentStamps', { max: controls.stampsTotal })}>
                  <input
                    type="number" min={0} max={controls.stampsTotal}
                    value={controls.currentStamps}
                    onChange={e => handleChange('currentStamps', clamp(Number(e.target.value), 0, controls.stampsTotal))}
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="pt-2">
                <p className="text-xs font-medium text-gray-500 mb-3">{t('walletPreview.stampModeTitle')}</p>
                <div className="space-y-2">
                  {(['default', 'custom'] as const).map(mode => (
                    <label
                      key={mode}
                      className={[
                        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                        controls.stampMode === mode
                          ? 'border-primary-200 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300',
                      ].join(' ')}
                    >
                      <input
                        type="radio" name="stampMode" value={mode}
                        checked={controls.stampMode === mode}
                        onChange={() => handleChange('stampMode', mode)}
                        className="mt-0.5 accent-primary-600"
                      />
                      <div className="min-w-0">
                        <p className={['text-sm font-medium', controls.stampMode === mode ? 'text-primary-700' : 'text-gray-700'].join(' ')}>
                          {mode === 'default' ? t('walletPreview.stampModeDefault') : t('walletPreview.stampModeCustom')}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {mode === 'default' ? t('walletPreview.stampModeDefaultDesc') : t('walletPreview.stampModeCustomDesc')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {controls.stampMode === 'custom' && (
                <>
                  <div className="border-t border-gray-100 pt-4 space-y-4">
                    <p className="text-xs font-medium text-gray-500">{t('walletPreview.stampImages')}</p>
                    {!rid && (
                      <p className="text-[11px] text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
                        {t('walletPreview.stampLoginRequired')}
                      </p>
                    )}
                    <StampUpload label={t('walletPreview.stampEmpty')} stampType="empty" currentUrl={controls.stampEmptyUrl} onUpload={url => handleChange('stampEmptyUrl', url)} accessToken={accessToken} restaurantId={rid} />
                    <StampUpload label={t('walletPreview.stampFilled')} stampType="filled" currentUrl={controls.stampFilledUrl} onUpload={url => handleChange('stampFilledUrl', url)} accessToken={accessToken} restaurantId={rid} />
                  </div>

                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <p className="text-xs font-medium text-gray-500">{t('walletPreview.stampLayout')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t('walletPreview.stampColumns')}>
                        <input type="number" min={1} max={10} value={controls.stampColumns} onChange={e => handleChange('stampColumns', clamp(Number(e.target.value), 1, 10))} className={inputCls} />
                      </Field>
                      <Field label={t('walletPreview.stampSize')}>
                        <input type="number" min={20} max={120} value={controls.stampSize} onChange={e => handleChange('stampSize', clamp(Number(e.target.value), 20, 120))} className={inputCls} />
                      </Field>
                      <Field label={t('walletPreview.stampGap')}>
                        <input type="number" min={0} max={40} value={controls.stampGap} onChange={e => handleChange('stampGap', clamp(Number(e.target.value), 0, 40))} className={inputCls} />
                      </Field>
                      <Field label={t('walletPreview.stampBg')}>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={controls.stampBg === 'transparent' ? '#000000' : controls.stampBg}
                            onChange={e => handleChange('stampBg', e.target.value)}
                            className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer p-0.5 flex-shrink-0"
                          />
                          <button
                            onClick={() => handleChange('stampBg', 'transparent')}
                            className={[
                              'text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors',
                              controls.stampBg === 'transparent'
                                ? 'bg-primary-50 border-primary-200 text-primary-700'
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100',
                            ].join(' ')}
                          >
                            {t('walletPreview.stampTransp')}
                          </button>
                        </div>
                      </Field>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700">{t('walletPreview.stampRound')}</p>
                        <p className="text-[11px] text-gray-400">{t('walletPreview.stampRoundDesc')}</p>
                      </div>
                      <Toggle checked={controls.stampRound} onChange={() => handleChange('stampRound', !controls.stampRound)} colorClass="bg-primary-600" />
                    </div>
                  </div>
                </>
              )}
            </Section>

            {/* ── Récompense ─────────────────────────────────────────────── */}
            <Section title={t('walletPreview.sectionReward')}>
              <Field label={t('walletPreview.fieldReward')}>
                <input type="text" value={controls.rewardText} onChange={e => handleChange('rewardText', e.target.value)} className={inputCls} />
              </Field>
            </Section>

            {/* ── Champs ─────────────────────────────────────────────────── */}
            <Section title={t('walletPreview.sectionFields')} defaultOpen={false}>

              {/* Zone map */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-[11px]">
                <p className="font-semibold text-gray-600 mb-2">{t('walletPreview.zoneMapTitle')}</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="text-gray-500">headerFields — {t('walletPreview.zoneHeaderDesc')}</span>
                  <span className="ml-auto font-mono text-gray-400">max 3</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-gray-500">primaryFields — {t('walletPreview.zonePrimaryDesc')}</span>
                  <span className="ml-auto font-mono text-gray-400">max 1</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-gray-500">secondaryFields — {t('walletPreview.zoneSecondaryDesc')}</span>
                  <span className="ml-auto font-mono text-gray-400">max 4</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                  <span className="text-gray-500">auxiliaryFields — {t('walletPreview.zoneAuxiliaryDesc')}</span>
                  <span className="ml-auto font-mono text-gray-400">max 4</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">backFields — {t('walletPreview.zoneBackDesc')}</span>
                  <span className="ml-auto font-mono text-gray-400">{t('walletPreview.zoneUnlimited')}</span>
                </div>
              </div>

              {/* headerFields */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <p className="text-xs font-medium text-gray-500">{t('walletPreview.headerFieldsLabel')}</p>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{controls.headerFields.length}/3</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">{t('walletPreview.headerFieldsHint')}</p>
                <FieldListEditor fields={controls.headerFields} onChange={f => handleChange('headerFields', f)} maxFields={3} addLabel={t('walletPreview.addField')} />
              </div>

              {/* secondaryFields */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <p className="text-xs font-medium text-gray-500">{t('walletPreview.secondaryFieldsLabel')}</p>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{controls.secondaryFields.length + 2}/4</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">{t('walletPreview.secondaryFieldsHint')}</p>
                <FieldListEditor fields={controls.secondaryFields} onChange={f => handleChange('secondaryFields', f)} maxFields={2} addLabel={t('walletPreview.addField')} />
              </div>

              {/* auxiliaryFields */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                    <p className="text-xs font-medium text-gray-500">{t('walletPreview.auxiliaryFieldsLabel')}</p>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{controls.auxiliaryFields.length + 1}/4</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">{t('walletPreview.auxiliaryFieldsHint')}</p>
                <FieldListEditor fields={controls.auxiliaryFields} onChange={f => handleChange('auxiliaryFields', f)} maxFields={3} addLabel={t('walletPreview.addField')} />
              </div>

              {/* backFields */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                    <p className="text-xs font-medium text-gray-500">{t('walletPreview.backFieldsLabel')}</p>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{controls.backFields.length}/10</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">{t('walletPreview.backFieldsHint')}</p>
                <FieldListEditor fields={controls.backFields} onChange={f => handleChange('backFields', f)} maxFields={10} addLabel={t('walletPreview.addField')} />
              </div>
            </Section>

            {/* ── QR code ────────────────────────────────────────────────── */}
            <Section title={t('walletPreview.sectionBarcode')}>
              {/* Apple placement note */}
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <span className="text-gray-400 text-xs mt-px flex-shrink-0">i</span>
                <p className="text-[11px] text-gray-500 leading-relaxed">{t('walletPreview.qrPlacementNote')}</p>
              </div>
              <Field label={t('walletPreview.fieldBarcodeFormat')}>
                <select value={controls.barcodeFormat} onChange={e => handleChange('barcodeFormat', e.target.value as BarcodeFormat)} className={inputCls}>
                  <option value="PKBarcodeFormatQR">QR Code</option>
                  <option value="PKBarcodeFormatPDF417">PDF417</option>
                  <option value="PKBarcodeFormatAztec">Aztec</option>
                  <option value="PKBarcodeFormatCode128">Code 128</option>
                </select>
              </Field>
              <Field label={t('walletPreview.fieldQrContent')}>
                <input type="text" value={controls.barcodePayload} onChange={e => handleChange('barcodePayload', e.target.value)} placeholder={t('walletPreview.fieldQrPlaceholder')} className={`${inputCls} font-mono text-xs`} />
              </Field>
              <Field label={t('walletPreview.fieldBarcodeAltText')}>
                <input type="text" value={controls.barcodeAltText} onChange={e => handleChange('barcodeAltText', e.target.value)} placeholder={t('walletPreview.barcodeAltTextPlaceholder')} className={inputCls} />
              </Field>
            </Section>

            {/* ── Sauvegarder ────────────────────────────────────────────── */}
            <TemplateSaver
              controls={controls}
              defaults={defaults}
              accessToken={accessToken}
              restaurantId={rid}
              onLoadTemplate={handleLoadTemplate}
              initialTemplateId={initialTemplateId}
            />

          </div>
        </div>
      </div>
    </div>
  );
}
