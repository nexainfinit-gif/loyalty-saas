/* eslint-disable @next/next/no-img-element */
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { supabase } from '@/lib/supabase';

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

/** All fields that drive the live preview */
interface Controls {
  merchantName:   string;
  bgColor:        string;
  stampsTotal:    number;
  currentStamps:  number;
  rewardText:     string;
  barcodePayload: string;
  isVip:          boolean;
  isPro:          boolean;
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

/** Derives a live pass.json from the current Controls state */
function buildPassJson(c: Controls): object {
  return {
    formatVersion:      1,
    passTypeIdentifier: 'pass.YOUR_BUNDLE_ID',
    serialNumber:       'CUSTOMER_UUID',
    teamIdentifier:     'YOUR_TEAM_ID',
    organizationName:   c.merchantName,
    description:        `Carte de fidélité – ${c.merchantName}`,
    backgroundColor:    hexToAppleRgb(c.bgColor),
    foregroundColor:    'rgb(255, 255, 255)',
    labelColor:         'rgb(200, 215, 255)',
    logoText:           c.merchantName,
    storeCard: {
      headerFields: [
        { key: 'stamp_count', label: 'TAMPONS', value: `${c.currentStamps} / ${c.stampsTotal}` },
      ],
      primaryFields: [
        { key: 'member_name', label: 'CLIENT', value: 'Marie Dupont' },
      ],
      secondaryFields: [
        { key: 'stamp_grid', label: 'PROGRESSION', value: stampGridText(c.currentStamps, c.stampsTotal) },
      ],
      auxiliaryFields: [
        { key: 'reward', label: 'RÉCOMPENSE', value: c.rewardText },
      ],
      backFields: [
        {
          key:   'program_info',
          label: 'Programme de fidélité',
          value: `Accumulez des tampons à chaque visite chez ${c.merchantName}. Présentez ce QR code en caisse.`,
        },
        {
          key:   'privacy',
          label: 'Données personnelles',
          value: 'Carte nominative et non transférable. Conforme au RGPD.',
        },
      ],
    },
    barcode: {
      message:         c.barcodePayload || 'CUSTOMER_QR_TOKEN',
      format:          'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText:         'Scannez ce code en caisse',
    },
  };
}

function metaToControls(meta: PassMeta): Controls {
  return {
    merchantName:   meta.restaurantName,
    bgColor:        meta.primaryColor,
    stampsTotal:    meta.stampsTotal,
    currentStamps:  meta.exampleStamps,
    rewardText:     meta.rewardMessage,
    barcodePayload: 'EXAMPLE_QR_TOKEN',
    isVip:          false,
    isPro:          meta.plan === 'pro',
    // Stamp engine defaults
    stampMode:      'default',
    stampColumns:   5,
    stampSize:      40,
    stampGap:       8,
    stampBg:        'transparent',
    stampRound:     true,
    stampEmptyUrl:  '',
    stampFilledUrl: '',
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
  const [stampErr, setStampErr] = useState(false);
  // Reset error whenever the URL changes
  useEffect(() => { setStampErr(false); }, [stampUrl]);

  const filled  = Math.min(c.currentStamps, c.stampsTotal);
  // isPro → purple gradient; otherwise plain bgColor
  const cardBg  = c.isPro
    ? `linear-gradient(135deg, ${c.bgColor}, #7c3aed)`
    : c.bgColor;

  return (
    <div
      className="w-full max-w-xs mx-auto rounded-[20px] overflow-hidden shadow-2xl select-none"
      style={{ background: cardBg }}
    >
      {/* ── Header row ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex-shrink-0 flex items-center justify-center text-white text-base font-bold">
            {c.merchantName.charAt(0).toUpperCase()}
          </div>
          <span className="text-white font-semibold text-sm truncate">{c.merchantName}</span>
          {c.isVip && (
            <span className="flex-shrink-0 text-[10px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-md">
              ⭐ VIP
            </span>
          )}
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <p className="text-white/60 text-[9px] uppercase tracking-widest font-medium">TAMPONS</p>
          <p className="text-white font-bold text-base tabular-nums">{filled} / {c.stampsTotal}</p>
        </div>
      </div>

      {/* ── Primary field ────────────────────────────────────────────── */}
      <div className="px-5 pb-3">
        <p className="text-white/60 text-[9px] uppercase tracking-widest font-medium mb-0.5">CLIENT</p>
        <p className="text-white font-semibold text-xl">Marie Dupont</p>
      </div>

      {/* ── Stamp grid ───────────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <p className="text-white/60 text-[9px] uppercase tracking-widest font-medium mb-2">PROGRESSION</p>
        {c.stampMode === 'custom' && stampUrl && !stampErr ? (
          /* Server-rendered custom stamp image */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stampUrl}
            alt={`${filled} / ${c.stampsTotal} tampons`}
            onError={() => setStampErr(true)}
            className="rounded-lg"
            style={{ maxWidth: '100%', imageRendering: 'crisp-edges' }}
          />
        ) : (
          /* Default: circle grid (Apple/Google standard appearance) */
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: c.stampsTotal }, (_, i) => (
              <div
                key={i}
                className={[
                  'w-7 h-7 rounded-full border-2 flex items-center justify-center',
                  i < filled ? 'bg-white border-white' : 'bg-transparent border-white/40',
                ].join(' ')}
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
      <div className="px-5 pb-3 pt-3 border-t border-white/10">
        <p className="text-white/60 text-[9px] uppercase tracking-widest font-medium mb-0.5">RÉCOMPENSE</p>
        <p className="text-white text-sm font-medium">{c.rewardText}</p>
      </div>

      {/* ── QR strip ─────────────────────────────────────────────────── */}
      <div className="bg-white/10 border-t border-white/10 px-5 py-4 flex items-center justify-between gap-4">
        <p className="text-white/70 text-xs leading-relaxed">
          Présentez ce<br />QR code en caisse
        </p>
        <div className="bg-white p-2 rounded-xl flex-shrink-0">
          <QRCode value={c.barcodePayload || 'EXAMPLE_QR_TOKEN'} size={64} />
        </div>
      </div>
    </div>
  );
}

/* ── PassJsonViewer ───────────────────────────────────────────────────────── */

/** Renders a live-updated pass.json derived from the current controls */
function PassJsonViewer({ controls }: { controls: Controls }) {
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
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">pass.json</span>
          <span className="text-[10px] bg-primary-50 text-primary-700 font-semibold px-2 py-0.5 rounded-md">storeCard</span>
          <span className="text-[10px] bg-warning-100 text-warning-700 font-semibold px-2 py-0.5 rounded-md">Aperçu — non signé</span>
        </div>
        <button
          onClick={copy}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          {copied ? '✓ Copié' : 'Copier'}
        </button>
      </div>
      <pre className="text-[11px] text-gray-700 font-mono p-5 overflow-auto max-h-72 leading-relaxed whitespace-pre">
        {json}
      </pre>
    </div>
  );
}

/* ── ControlPanel helpers — defined at module scope so their references are  ──
   stable across renders. Defining them inside ControlPanel would give them a  ──
   new function identity on every state update, causing React to unmount/remount ─
   the subtree and destroying input focus on each keystroke.                  ── */

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

/* ── StampUpload — module scope for stable identity across renders ─────────── */

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
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!accessToken) {
      setUploadErr('Connectez-vous pour uploader des images.');
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
      if (!res.ok) { setUploadErr(json.error ?? 'Erreur'); return; }
      onUpload(json.url);
    } catch {
      setUploadErr('Erreur réseau');
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-uploaded
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt=""
            className="w-9 h-9 rounded-lg object-cover border border-gray-200 flex-shrink-0 bg-gray-100"
          />
        )}
        <label className={btnCls}>
          {uploading ? '⏳ Envoi…' : currentUrl ? 'Changer' : '+ Image'}
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
            title="Supprimer"
          >
            ✕
          </button>
        )}
      </div>
      {uploadErr && <p className="text-[11px] text-danger-600 mt-1">{uploadErr}</p>}
    </div>
  );
}

/* ── ControlPanel ─────────────────────────────────────────────────────────── */

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
  const [tab, setTab] = useState<'carte' | 'tampons'>('carte');

  const isDirty  = JSON.stringify(controls) !== JSON.stringify(defaults);
  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Contrôles</span>
        <button
          onClick={onReset}
          disabled={!isDirty}
          className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Réinitialiser
        </button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100">
        {(['carte', 'tampons'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex-1 py-2.5 text-xs font-semibold transition-colors',
              tab === t
                ? 'text-primary-700 border-b-2 border-primary-600 -mb-px bg-white'
                : 'text-gray-400 hover:text-gray-600',
            ].join(' ')}
          >
            {t === 'carte' ? 'Carte' : 'Tampons'}
          </button>
        ))}
      </div>

      {/* ── Tab: Carte ────────────────────────────────────────────────── */}
      {tab === 'carte' && (
        <div className="p-5 space-y-5">

          <Field label="Nom du commerce">
            <input
              type="text"
              value={controls.merchantName}
              onChange={e => onChange('merchantName', e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Couleur de fond">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={controls.bgColor}
                onChange={e => onChange('bgColor', e.target.value)}
                className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer p-0.5 flex-shrink-0"
              />
              <input
                type="text"
                value={controls.bgColor}
                onChange={e => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value))
                    onChange('bgColor', e.target.value);
                }}
                maxLength={7}
                className={`${inputCls} font-mono uppercase`}
              />
            </div>
          </Field>

          <Field label="Objectif tampons">
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

          <Field label={`Tampons actuels (0 – ${controls.stampsTotal})`}>
            <input
              type="number" min={0} max={controls.stampsTotal}
              value={controls.currentStamps}
              onChange={e =>
                onChange('currentStamps', clamp(Number(e.target.value), 0, controls.stampsTotal))
              }
              className={inputCls}
            />
          </Field>

          <Field label="Récompense">
            <input
              type="text"
              value={controls.rewardText}
              onChange={e => onChange('rewardText', e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Contenu du QR code">
            <input
              type="text"
              value={controls.barcodePayload}
              onChange={e => onChange('barcodePayload', e.target.value)}
              placeholder="customer_id ou qr_token"
              className={`${inputCls} font-mono text-xs`}
            />
          </Field>

          <div className="pt-1 border-t border-gray-100 space-y-4">
            <p className="text-xs font-medium text-gray-500 pt-1">États</p>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">⭐ VIP</p>
                <p className="text-[11px] text-gray-400">Badge VIP sur la carte</p>
              </div>
              <Toggle
                checked={controls.isVip}
                onChange={() => onChange('isVip', !controls.isVip)}
                colorClass="bg-vip-600"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">✦ Pro</p>
                <p className="text-[11px] text-gray-400">Dégradé violet sur la carte</p>
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

      {/* ── Tab: Tampons ──────────────────────────────────────────────── */}
      {tab === 'tampons' && (
        <div className="p-5 space-y-5">

          {/* Mode selector */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-3">Mode d&apos;affichage</p>
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
                      {mode === 'default' ? 'Par défaut (Apple / Google)' : 'Personnalisé (logos)'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {mode === 'default'
                        ? 'Cercles standard — fonctionne partout, aucune image requise'
                        : 'Vos propres images pour les tampons vides et remplis'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Custom mode controls — only shown when mode = custom */}
          {controls.stampMode === 'custom' && (
            <>
              {/* Image upload */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <p className="text-xs font-medium text-gray-500">Images</p>
                {!restaurantId && (
                  <p className="text-[11px] text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
                    Connectez-vous pour uploader des images personnalisées.
                  </p>
                )}
                <StampUpload
                  label="Tampon vide"
                  stampType="empty"
                  currentUrl={controls.stampEmptyUrl}
                  onUpload={url => onChange('stampEmptyUrl', url)}
                  accessToken={accessToken}
                  restaurantId={restaurantId}
                />
                <StampUpload
                  label="Tampon rempli"
                  stampType="filled"
                  currentUrl={controls.stampFilledUrl}
                  onUpload={url => onChange('stampFilledUrl', url)}
                  accessToken={accessToken}
                  restaurantId={restaurantId}
                />
              </div>

              {/* Layout */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs font-medium text-gray-500">Mise en page</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Colonnes">
                    <input
                      type="number" min={1} max={10}
                      value={controls.stampColumns}
                      onChange={e => onChange('stampColumns', clamp(Number(e.target.value), 1, 10))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Taille (px)">
                    <input
                      type="number" min={20} max={120}
                      value={controls.stampSize}
                      onChange={e => onChange('stampSize', clamp(Number(e.target.value), 20, 120))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Espacement (px)">
                    <input
                      type="number" min={0} max={40}
                      value={controls.stampGap}
                      onChange={e => onChange('stampGap', clamp(Number(e.target.value), 0, 40))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Fond">
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
                        Transp.
                      </button>
                    </div>
                  </Field>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700">Masque circulaire</p>
                    <p className="text-[11px] text-gray-400">Arrondit les images en cercle</p>
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

/* ── SigningGuide ──────────────────────────────────────────────────────────── */

const SIGNING_STEPS = [
  {
    n: 1,
    title: 'Apple Developer Program',
    desc: 'Inscrivez-vous sur developer.apple.com (99 $/an). Obligatoire pour créer des Pass Type Identifiers et signer.',
    code: null,
  },
  {
    n: 2,
    title: 'Créer un Pass Type Identifier',
    desc: 'Portail développeur → Certificates, Identifiers & Profiles → Identifiers → Pass Type IDs. Remplacez "pass.YOUR_BUNDLE_ID" dans le pass.json.',
    code: null,
  },
  {
    n: 3,
    title: 'Générer les certificats',
    desc: "Créez un certificat Pass Type ID depuis le portail. Téléchargez le certificat WWDR intermédiaire d'Apple (G4). Exportez votre clé privée en .pem.",
    code: null,
  },
  {
    n: 4,
    title: 'Installer passkit-generator',
    desc: 'Bibliothèque Node.js qui construit et signe le bundle .pkpass.',
    code: 'npm install passkit-generator',
  },
  {
    n: 5,
    title: 'Créer /api/wallet/generate/route.ts',
    desc: 'Importez PKPass, chargez vos certificats depuis les variables d\'environnement, signez le pass.json, et renvoyez le fichier .pkpass.',
    code: 'Content-Type: application/vnd.apple.pkpass',
  },
  {
    n: 6,
    title: 'Convertir les images SVG → PNG',
    desc: 'Les fichiers /public/wallet/icon.svg et logo.svg doivent être exportés en PNG aux dimensions exactes listées ci-dessous et inclus dans le bundle.',
    code: null,
  },
];

function SigningGuide({ imagesRequired }: { imagesRequired: ImageRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Étapes pour activer la signature</h3>
        <p className="text-xs text-gray-500 mt-0.5">Complétez ces étapes pour distribuer de vrais .pkpass</p>
      </div>

      <div className="divide-y divide-gray-50">
        {SIGNING_STEPS.map(step => (
          <div key={step.n} className="px-5 py-4 flex gap-4">
            <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-[11px] font-bold flex-shrink-0 flex items-center justify-center mt-0.5">
              {step.n}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 mb-0.5">{step.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
              {step.code && (
                <code className="mt-1.5 inline-block text-[11px] bg-gray-50 text-gray-700 font-mono px-2 py-1 rounded-lg border border-gray-200">
                  {step.code}
                </code>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Images table */}
      <div className="border-t border-gray-100 px-5 py-4">
        <p className="text-xs font-semibold text-gray-700 mb-3">Images requises dans le bundle .pkpass</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="text-left pb-2 font-semibold">Fichier</th>
                <th className="text-left pb-2 font-semibold">Dimensions</th>
                <th className="text-left pb-2 font-semibold hidden sm:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {imagesRequired.map(img => (
                <tr key={img.file}>
                  <td className="py-1.5 font-mono text-gray-700 pr-4">{img.file}</td>
                  <td className="py-1.5 text-gray-500 tabular-nums pr-4 whitespace-nowrap">{img.size}</td>
                  <td className="py-1.5 text-gray-400 hidden sm:table-cell">{img.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Placeholders SVG disponibles dans{' '}
          <code className="font-mono text-gray-500">/public/wallet/</code> — convertissez-les en PNG avant de signer.
        </p>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function WalletPreviewPage() {
  const router = useRouter();
  const [data, setData]         = useState<PreviewData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [controls, setControls]   = useState<Controls | null>(null);
  const [defaults, setDefaults]   = useState<Controls | null>(null);
  const [stampUrl, setStampUrl]   = useState('');
  const [accessToken, setToken]   = useState('');

  // Debounce stamp URL — only rebuild when mode = custom, clear otherwise
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
      // ── Determine URL and headers based on session ─────────────────────
      // Session is stored in localStorage by @supabase/supabase-js; we pass
      // it as a Bearer token so the server can validate without needing cookies.
      let url: string;
      let headers: Record<string, string> = {};

      if (session) {
        // Logged in: always use real API, in any environment
        setToken(session.access_token);
        url     = '/api/wallet/preview';
        headers = { Authorization: `Bearer ${session.access_token}` };
      } else if (process.env.NODE_ENV !== 'production') {
        // Not logged in + dev: show demo (no redirect)
        url = '/api/wallet/preview?demo=1';
      } else {
        // Not logged in + production: redirect to login
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
          setError(err.is401 ? '__401__' : 'Erreur réseau lors du chargement du preview.');
        })
        .finally(() => setLoading(false));
    });
  }, [router]);

  function handleChange<K extends keyof Controls>(key: K, val: Controls[K]) {
    setControls(prev => prev ? { ...prev, [key]: val } : prev);
  }

  function handleReset() {
    setControls(defaults);
  }

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-ds-spin mx-auto mb-4" />
        <p className="text-sm text-gray-400 font-medium">Chargement...</p>
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
              <p className="text-gray-900 font-semibold mb-1">Connexion requise</p>
              <p className="text-sm text-gray-500 mb-5">
                Connectez-vous pour accéder à la prévisualisation Wallet.
              </p>
              <button
                onClick={() => router.push('/dashboard/login')}
                className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                Se connecter
              </button>
            </>
          ) : (
            <>
              <p className="text-danger-600 font-semibold mb-2">Erreur</p>
              <p className="text-sm text-gray-500">{error || 'Impossible de charger le preview.'}</p>
              <button
                onClick={() => router.push('/dashboard')}
                className="mt-5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
              >
                ← Retour au tableau de bord
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
          Tableau de bord
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-sm font-semibold text-gray-900">Apple Wallet — Prévisualisation</h1>
        <span className="ml-auto text-[11px] bg-warning-100 text-warning-700 font-semibold px-2.5 py-1 rounded-lg">
          Aperçu uniquement · pas de signature
        </span>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Info banner */}
        <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex items-start gap-3 mb-8">
          <span className="text-primary-600 mt-0.5 flex-shrink-0">ℹ</span>
          <p className="text-xs text-primary-700 leading-relaxed">
            Ce preview visualise la structure d&apos;une carte Apple Wallet pour <strong>{controls.merchantName}</strong>.
            Aucun fichier .pkpass réel n&apos;est généré ici — complétez les étapes de signature ci-dessous pour distribuer
            de vraies cartes aux clients.
          </p>
        </div>

        {/* 3-column grid: card | pass.json+guide | controls */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_280px] gap-6 items-start">

          {/* ── Col 1 — Card + legend ──────────────────────────────────── */}
          <div className="flex flex-col gap-6">

            {/* Pro badge */}
            {controls.isPro && (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5">
                <span className="text-purple-600 text-sm">✦</span>
                <span className="text-xs font-semibold text-purple-700">Plan Pro — Apple Wallet activé</span>
              </div>
            )}

            {/* Card */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Aperçu carte</p>
              <WalletCard c={controls} stampUrl={stampUrl} />
            </div>

            {/* Field legend */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-xs font-semibold text-gray-700 mb-3">Correspondance des champs</p>
              <div className="space-y-2 text-[11px] text-gray-500">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">headerFields[0]</span>
                  <span className="font-mono text-gray-600">{controls.currentStamps} / {controls.stampsTotal}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">primaryFields[0]</span>
                  <span className="font-mono text-gray-600">Marie Dupont</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">secondaryFields</span>
                  <span className="font-mono text-gray-600">Grille tampons</span>
                </div>
                <div className="flex justify-between gap-2 min-w-0">
                  <span className="text-gray-400 flex-shrink-0">barcode.message</span>
                  <span className="font-mono text-gray-600 truncate max-w-[120px]">{controls.barcodePayload || '—'}</span>
                </div>
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
              </div>
            </div>
          </div>

          {/* ── Col 2 — pass.json + signing guide ──────────────────────── */}
          <div className="flex flex-col gap-6 min-w-0">
            <PassJsonViewer controls={controls} />
            <SigningGuide imagesRequired={data.meta.imagesRequired} />
          </div>

          {/* ── Col 3 — Control panel (sticky) ─────────────────────────── */}
          <div className="lg:sticky lg:top-20">
            <ControlPanel
              controls={controls}
              defaults={defaults}
              onChange={handleChange}
              onReset={handleReset}
              accessToken={accessToken}
              restaurantId={data.meta.restaurantId ?? ''}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
