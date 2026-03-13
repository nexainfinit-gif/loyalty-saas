/* eslint-disable @next/next/no-img-element */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSubscriptionGate } from '@/lib/use-subscription-gate';
import QRCode from 'react-qr-code';
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
  headerFields:   PassField[];
  secondaryFields: PassField[];
  backFields:     PassField[];
  // Barcode
  barcodePayload: string;
  barcodeFormat:  BarcodeFormat;
  barcodeAltText: string;
  // States
  isVip:          boolean;
  isPro:          boolean;
  // Strip image
  stripImageUrl:  string;
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
  const card: Record<string, unknown> = {
    primaryFields: [
      { key: 'stamps', label: 'TAMPONS', value: `${c.currentStamps} / ${c.stampsTotal}` },
    ],
    auxiliaryFields: [
      { key: 'holder', label: 'CLIENT', value: 'Marie Dupont' },
      { key: 'reward', label: 'RÉCOMPENSE', value: c.rewardText },
    ],
  };
  if (c.headerFields.length > 0)    card.headerFields    = c.headerFields;
  if (c.secondaryFields.length > 0) card.secondaryFields = c.secondaryFields;
  if (c.backFields.length > 0)      card.backFields      = c.backFields;

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
    logoText:           c.logoText,
    storeCard:          card,
    barcode: {
      message:         c.barcodePayload || 'CUSTOMER_QR_TOKEN',
      format:          c.barcodeFormat,
      messageEncoding: 'iso-8859-1',
      ...(c.barcodeAltText ? { altText: c.barcodeAltText } : {}),
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
    backFields:      [],
    barcodePayload:  'EXAMPLE_QR_TOKEN',
    barcodeFormat:   'PKBarcodeFormatQR',
    barcodeAltText:  '',
    isVip:           false,
    isPro:           meta.plan === 'pro',
    stripImageUrl:   '',
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
    backFields:      Array.isArray(cfg.backFields) ? cfg.backFields as PassField[] : base.backFields,
    barcodeFormat:   (cfg.barcodeFormat as BarcodeFormat) ?? base.barcodeFormat,
    barcodeAltText:  (cfg.barcodeAltText as string) ?? base.barcodeAltText,
    stripImageUrl:   (cfg.stripImageUrl as string) ?? base.stripImageUrl,
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
  const cardBg  = c.isPro
    ? `linear-gradient(135deg, ${c.bgColor}, #7c3aed)`
    : c.bgColor;

  return (
    <div
      className="w-full max-w-xs mx-auto rounded-[20px] overflow-hidden shadow-2xl select-none"
      style={{ background: cardBg }}
    >
      {/* ── Strip image ──────────────────────────────────────────────── */}
      {c.stripImageUrl && (
        <div className="w-full h-[82px] overflow-hidden">
          <img
            src={c.stripImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* ── Header row ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex-shrink-0 flex items-center justify-center text-base font-bold"
               style={{ color: c.foregroundColor }}>
            {c.merchantName.charAt(0).toUpperCase()}
          </div>
          <span className="font-semibold text-sm truncate" style={{ color: c.foregroundColor }}>
            {c.logoText || c.merchantName}
          </span>
          {c.isVip && (
            <span className="flex-shrink-0 text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-md"
                  style={{ color: c.foregroundColor }}>
              VIP
            </span>
          )}
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: c.labelColor, opacity: 0.7 }}>TAMPONS</p>
          <p className="font-bold text-base tabular-nums" style={{ color: c.foregroundColor }}>{filled} / {c.stampsTotal}</p>
        </div>
      </div>

      {/* ── Header fields (custom) ────────────────────────────────── */}
      {c.headerFields.length > 0 && (
        <div className="px-5 pb-2 flex gap-4">
          {c.headerFields.map((f, i) => (
            <div key={i}>
              <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: c.labelColor, opacity: 0.7 }}>{f.label}</p>
              <p className="text-sm font-medium" style={{ color: c.foregroundColor }}>{f.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Primary field ────────────────────────────────────────────── */}
      <div className="px-5 pb-3">
        <p className="text-[9px] uppercase tracking-widest font-medium mb-0.5" style={{ color: c.labelColor, opacity: 0.7 }}>CLIENT</p>
        <p className="font-semibold text-xl" style={{ color: c.foregroundColor }}>Marie Dupont</p>
      </div>

      {/* ── Secondary fields (custom) ─────────────────────────────── */}
      {c.secondaryFields.length > 0 && (
        <div className="px-5 pb-3 flex gap-4 flex-wrap">
          {c.secondaryFields.map((f, i) => (
            <div key={i} className="min-w-0">
              <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: c.labelColor, opacity: 0.7 }}>{f.label}</p>
              <p className="text-sm font-medium" style={{ color: c.foregroundColor }}>{f.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Stamp grid ───────────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <p className="text-[9px] uppercase tracking-widest font-medium mb-2" style={{ color: c.labelColor, opacity: 0.7 }}>PROGRESSION</p>
        {c.stampMode === 'custom' && stampUrl && !stampErr ? (
          <img
            src={stampUrl}
            alt={`${filled} / ${c.stampsTotal} tampons`}
            onError={() => setStampErr(true)}
            className="rounded-lg"
            style={{ maxWidth: '100%', imageRendering: 'crisp-edges' }}
          />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: c.stampsTotal }, (_, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center"
                style={{
                  backgroundColor: i < filled ? c.foregroundColor : 'transparent',
                  borderColor: i < filled ? c.foregroundColor : `${c.foregroundColor}66`,
                }}
              >
                {i < filled && (
                  <span className="text-[10px] font-bold" style={{ color: c.bgColor }}>✓</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Reward ───────────────────────────────────────────────────── */}
      <div className="px-5 pb-3 pt-3" style={{ borderTop: `1px solid ${c.foregroundColor}1a` }}>
        <p className="text-[9px] uppercase tracking-widest font-medium mb-0.5" style={{ color: c.labelColor, opacity: 0.7 }}>RÉCOMPENSE</p>
        <p className="text-sm font-medium" style={{ color: c.foregroundColor }}>{c.rewardText}</p>
      </div>

      {/* ── QR strip ─────────────────────────────────────────────────── */}
      <div className="px-5 py-4 flex items-center justify-between gap-4"
           style={{ borderTop: `1px solid ${c.foregroundColor}1a`, background: `${c.foregroundColor}0d` }}>
        <p className="text-xs leading-relaxed" style={{ color: c.foregroundColor, opacity: 0.7 }}>
          {c.barcodeAltText || t('walletPreview.scanQrInstructions')}
        </p>
        <div className="bg-white p-2 rounded-xl flex-shrink-0">
          <QRCode value={c.barcodePayload || 'EXAMPLE_QR_TOKEN'} size={64} />
        </div>
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

/* ── ImageUpload — generic image upload (strip, logo) ─────────────────── */

function ImageUpload({
  label,
  hint,
  currentUrl,
  onUpload,
  accessToken,
  restaurantId,
  uploadType,
}: {
  label:        string;
  hint?:        string;
  currentUrl:   string;
  onUpload:     (url: string) => void;
  accessToken:  string;
  restaurantId: string;
  uploadType:   string;
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
    form.append('type', uploadType);
    form.append('restaurantId', restaurantId);
    form.append('file', file);
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
      e.target.value = '';
    }
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
            onChange={handleFile}
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
    </div>
  );
}

/* ── ControlPanel ─────────────────────────────────────────────────────────── */

type TabKey = 'apparence' | 'champs' | 'barcode' | 'tampons';

function ControlPanel({
  controls,
  defaults,
  onChange,
  onReset,
  accessToken,
  restaurantId,
}: {
  controls:     Controls;
  defaults:     Controls;
  onChange:     <K extends keyof Controls>(key: K, val: Controls[K]) => void;
  onReset:      () => void;
  accessToken:  string;
  restaurantId: string;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('apparence');

  const isDirty  = JSON.stringify(controls) !== JSON.stringify(defaults);
  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'apparence', label: t('walletPreview.tabAppearance') },
    { key: 'champs',    label: t('walletPreview.tabFields') },
    { key: 'barcode',   label: t('walletPreview.tabBarcode') },
    { key: 'tampons',   label: t('walletPreview.tabStamps') },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('walletPreview.controlsTitle')}</span>
        <button
          onClick={onReset}
          disabled={!isDirty}
          className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('walletPreview.resetBtn')}
        </button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'flex-1 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap px-2',
              tab === key
                ? 'text-primary-700 border-b-2 border-primary-600 -mb-px bg-white'
                : 'text-gray-400 hover:text-gray-600',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Apparence ─────────────────────────────────────────── */}
      {tab === 'apparence' && (
        <div className="p-5 space-y-5">

          <Field label={t('walletPreview.fieldMerchantName')}>
            <input
              type="text"
              value={controls.merchantName}
              onChange={e => onChange('merchantName', e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label={t('walletPreview.fieldLogoText')}>
            <input
              type="text"
              value={controls.logoText}
              onChange={e => onChange('logoText', e.target.value)}
              placeholder={controls.merchantName}
              className={inputCls}
            />
          </Field>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-3">{t('walletPreview.colorsTitle')}</p>
            <div className="space-y-4">
              <ColorPicker
                label={t('walletPreview.fieldBgColor')}
                value={controls.bgColor}
                onChange={v => onChange('bgColor', v)}
              />
              <ColorPicker
                label={t('walletPreview.fieldFgColor')}
                value={controls.foregroundColor}
                onChange={v => onChange('foregroundColor', v)}
              />
              <ColorPicker
                label={t('walletPreview.fieldLabelColor')}
                value={controls.labelColor}
                onChange={v => onChange('labelColor', v)}
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <ImageUpload
              label={t('walletPreview.fieldStripImage')}
              hint={t('walletPreview.stripImageHint')}
              currentUrl={controls.stripImageUrl}
              onUpload={url => onChange('stripImageUrl', url)}
              accessToken={accessToken}
              restaurantId={restaurantId}
              uploadType="strip"
            />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <p className="text-xs font-medium text-gray-500">{t('walletPreview.statesTitle')}</p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{t('walletPreview.stateVip')}</p>
                <p className="text-[11px] text-gray-400">{t('walletPreview.stateVipDesc')}</p>
              </div>
              <Toggle
                checked={controls.isVip}
                onChange={() => onChange('isVip', !controls.isVip)}
                colorClass="bg-vip-600"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{t('walletPreview.statePro')}</p>
                <p className="text-[11px] text-gray-400">{t('walletPreview.stateProDesc')}</p>
              </div>
              <Toggle
                checked={controls.isPro}
                onChange={() => onChange('isPro', !controls.isPro)}
                colorClass="bg-purple-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Champs ────────────────────────────────────────────── */}
      {tab === 'champs' && (
        <div className="p-5 space-y-5">

          <Field label={t('walletPreview.fieldStampsGoal')}>
            <input
              type="number" min={1} max={20}
              value={controls.stampsTotal}
              onChange={e => {
                const v = clamp(Number(e.target.value), 1, 20);
                onChange('stampsTotal', v);
                if (controls.currentStamps > v) onChange('currentStamps', v);
              }}
              className={inputCls}
            />
          </Field>

          <Field label={t('walletPreview.fieldCurrentStamps', { max: controls.stampsTotal })}>
            <input
              type="number" min={0} max={controls.stampsTotal}
              value={controls.currentStamps}
              onChange={e =>
                onChange('currentStamps', clamp(Number(e.target.value), 0, controls.stampsTotal))
              }
              className={inputCls}
            />
          </Field>

          <Field label={t('walletPreview.fieldReward')}>
            <input
              type="text"
              value={controls.rewardText}
              onChange={e => onChange('rewardText', e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">{t('walletPreview.headerFieldsLabel')}</p>
            <p className="text-[11px] text-gray-400 mb-3">{t('walletPreview.headerFieldsHint')}</p>
            <FieldListEditor
              fields={controls.headerFields}
              onChange={f => onChange('headerFields', f)}
              maxFields={3}
              addLabel={t('walletPreview.addField')}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">{t('walletPreview.secondaryFieldsLabel')}</p>
            <p className="text-[11px] text-gray-400 mb-3">{t('walletPreview.secondaryFieldsHint')}</p>
            <FieldListEditor
              fields={controls.secondaryFields}
              onChange={f => onChange('secondaryFields', f)}
              maxFields={2}
              addLabel={t('walletPreview.addField')}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">{t('walletPreview.backFieldsLabel')}</p>
            <p className="text-[11px] text-gray-400 mb-3">{t('walletPreview.backFieldsHint')}</p>
            <FieldListEditor
              fields={controls.backFields}
              onChange={f => onChange('backFields', f)}
              maxFields={10}
              addLabel={t('walletPreview.addField')}
            />
          </div>
        </div>
      )}

      {/* ── Tab: Barcode ───────────────────────────────────────────── */}
      {tab === 'barcode' && (
        <div className="p-5 space-y-5">

          <Field label={t('walletPreview.fieldBarcodeFormat')}>
            <select
              value={controls.barcodeFormat}
              onChange={e => onChange('barcodeFormat', e.target.value as BarcodeFormat)}
              className={inputCls}
            >
              <option value="PKBarcodeFormatQR">QR Code</option>
              <option value="PKBarcodeFormatPDF417">PDF417</option>
              <option value="PKBarcodeFormatAztec">Aztec</option>
              <option value="PKBarcodeFormatCode128">Code 128</option>
            </select>
          </Field>

          <Field label={t('walletPreview.fieldQrContent')}>
            <input
              type="text"
              value={controls.barcodePayload}
              onChange={e => onChange('barcodePayload', e.target.value)}
              placeholder={t('walletPreview.fieldQrPlaceholder')}
              className={`${inputCls} font-mono text-xs`}
            />
          </Field>

          <Field label={t('walletPreview.fieldBarcodeAltText')}>
            <input
              type="text"
              value={controls.barcodeAltText}
              onChange={e => onChange('barcodeAltText', e.target.value)}
              placeholder={t('walletPreview.barcodeAltTextPlaceholder')}
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {/* ── Tab: Tampons ──────────────────────────────────────────────── */}
      {tab === 'tampons' && (
        <div className="p-5 space-y-5">

          {/* Mode selector */}
          <div>
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
                    type="radio"
                    name="stampMode"
                    value={mode}
                    checked={controls.stampMode === mode}
                    onChange={() => onChange('stampMode', mode)}
                    className="mt-0.5 accent-primary-600"
                  />
                  <div className="min-w-0">
                    <p className={[
                      'text-sm font-medium',
                      controls.stampMode === mode ? 'text-primary-700' : 'text-gray-700',
                    ].join(' ')}>
                      {mode === 'default' ? t('walletPreview.stampModeDefault') : t('walletPreview.stampModeCustom')}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {mode === 'default'
                        ? t('walletPreview.stampModeDefaultDesc')
                        : t('walletPreview.stampModeCustomDesc')}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Custom mode controls */}
          {controls.stampMode === 'custom' && (
            <>
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <p className="text-xs font-medium text-gray-500">{t('walletPreview.stampImages')}</p>
                {!restaurantId && (
                  <p className="text-[11px] text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
                    {t('walletPreview.stampLoginRequired')}
                  </p>
                )}
                <StampUpload
                  label={t('walletPreview.stampEmpty')}
                  stampType="empty"
                  currentUrl={controls.stampEmptyUrl}
                  onUpload={url => onChange('stampEmptyUrl', url)}
                  accessToken={accessToken}
                  restaurantId={restaurantId}
                />
                <StampUpload
                  label={t('walletPreview.stampFilled')}
                  stampType="filled"
                  currentUrl={controls.stampFilledUrl}
                  onUpload={url => onChange('stampFilledUrl', url)}
                  accessToken={accessToken}
                  restaurantId={restaurantId}
                />
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs font-medium text-gray-500">{t('walletPreview.stampLayout')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('walletPreview.stampColumns')}>
                    <input
                      type="number" min={1} max={10}
                      value={controls.stampColumns}
                      onChange={e => onChange('stampColumns', clamp(Number(e.target.value), 1, 10))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('walletPreview.stampSize')}>
                    <input
                      type="number" min={20} max={120}
                      value={controls.stampSize}
                      onChange={e => onChange('stampSize', clamp(Number(e.target.value), 20, 120))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('walletPreview.stampGap')}>
                    <input
                      type="number" min={0} max={40}
                      value={controls.stampGap}
                      onChange={e => onChange('stampGap', clamp(Number(e.target.value), 0, 40))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('walletPreview.stampBg')}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={controls.stampBg === 'transparent' ? '#000000' : controls.stampBg}
                        onChange={e => onChange('stampBg', e.target.value)}
                        className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer p-0.5 flex-shrink-0"
                      />
                      <button
                        onClick={() => onChange('stampBg', 'transparent')}
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
                  <Toggle
                    checked={controls.stampRound}
                    onChange={() => onChange('stampRound', !controls.stampRound)}
                    colorClass="bg-primary-600"
                  />
                </div>
              </div>
            </>
          )}
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
    backFields:      c.backFields,
    barcodeFormat:   c.barcodeFormat,
    barcodeAltText:  c.barcodeAltText,
    stripImageUrl:   c.stripImageUrl,
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
}: {
  controls:       Controls;
  defaults:       Controls;
  accessToken:    string;
  restaurantId:   string;
  onLoadTemplate: (cfg: Record<string, unknown>) => void;
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
    fetch(`/api/wallet/templates?restaurantId=${restaurantId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(json => {
        if (json.templates) {
          setTemplates(json.templates.map((t: any) => ({
            id: t.id, name: t.name, pass_kind: t.pass_kind,
            config_json: t.config_json ?? null,
          })));
          if (json.templates.length > 0) setSelectedId(json.templates[0].id);
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
      const res = await fetch(`/api/wallet/templates/${selectedId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
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
      const res = await fetch('/api/wallet/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name:          newName.trim(),
          type:          'stamps',
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
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const { ready: subReady } = useSubscriptionGate();
  const [data, setData]         = useState<PreviewData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [controls, setControls]   = useState<Controls | null>(null);
  const [defaults, setDefaults]   = useState<Controls | null>(null);
  const [stampUrl, setStampUrl]   = useState('');
  const [accessToken, setToken]   = useState('');

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
                onClick={() => router.push('/dashboard')}
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
  return (
    <div className="min-h-screen bg-surface">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 h-14 flex items-center px-6 gap-4 shadow-[0_1px_0_rgba(17,24,39,0.04)]">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('auth.dashboardTitle')}
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-sm font-semibold text-gray-900">{t('walletPreview.pageTitle')}</h1>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Info banner */}
        <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex items-start gap-3 mb-8">
          <span className="text-primary-600 mt-0.5 flex-shrink-0">i</span>
          <p className="text-xs text-primary-700 leading-relaxed">
            {t('walletPreview.infoBannerConfigurator', { name: controls.merchantName })}
          </p>
        </div>

        {/* 3-column grid: card preview | pass.json | controls + save */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] gap-6 items-start">

          {/* ── Col 1 — Card + legend ──────────────────────────────────── */}
          <div className="flex flex-col gap-6">

            {controls.isPro && (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5">
                <span className="text-purple-600 text-sm">✦</span>
                <span className="text-xs font-semibold text-purple-700">{t('walletPreview.proActive')}</span>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('walletPreview.cardPreview')}</p>
              <WalletCard c={controls} stampUrl={stampUrl} />
            </div>

            {/* Field legend */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-xs font-semibold text-gray-700 mb-3">{t('walletPreview.fieldMapping')}</p>
              <div className="space-y-2 text-[11px] text-gray-500">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">backgroundColor</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ backgroundColor: controls.bgColor }}
                    />
                    <span className="font-mono text-gray-600">{controls.bgColor}</span>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">foregroundColor</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ backgroundColor: controls.foregroundColor }}
                    />
                    <span className="font-mono text-gray-600">{controls.foregroundColor}</span>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">labelColor</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ backgroundColor: controls.labelColor }}
                    />
                    <span className="font-mono text-gray-600">{controls.labelColor}</span>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">barcode.format</span>
                  <span className="font-mono text-gray-600 text-[10px]">{controls.barcodeFormat.replace('PKBarcodeFormat', '')}</span>
                </div>
                {controls.headerFields.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">headerFields</span>
                    <span className="font-mono text-gray-600">{controls.headerFields.length}</span>
                  </div>
                )}
                {controls.secondaryFields.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">secondaryFields</span>
                    <span className="font-mono text-gray-600">{controls.secondaryFields.length}</span>
                  </div>
                )}
                {controls.backFields.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">backFields</span>
                    <span className="font-mono text-gray-600">{controls.backFields.length}</span>
                  </div>
                )}
                {controls.stripImageUrl && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">strip.png</span>
                    <span className="font-mono text-success-600 text-[10px]">375×123</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Col 2 — pass.json ───────────────────────────────────────── */}
          <div className="flex flex-col gap-6 min-w-0">
            <PassJsonViewer controls={controls} />
          </div>

          {/* ── Col 3 — Control panel + template saver (sticky) ──────── */}
          <div className="lg:sticky lg:top-20 space-y-6">
            <ControlPanel
              controls={controls}
              defaults={defaults}
              onChange={handleChange}
              onReset={handleReset}
              accessToken={accessToken}
              restaurantId={data.meta.restaurantId ?? ''}
            />
            <TemplateSaver
              controls={controls}
              defaults={defaults}
              accessToken={accessToken}
              restaurantId={data.meta.restaurantId ?? ''}
              onLoadTemplate={handleLoadTemplate}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
