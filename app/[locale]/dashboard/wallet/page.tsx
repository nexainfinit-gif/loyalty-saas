'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSubscriptionGate } from '@/lib/use-subscription-gate';
import AddToAppleWalletButton from '@/components/AddToAppleWalletButton';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';

/* ── Types ────────────────────────────────────────────────────────────────── */

type PassKind = 'stamps' | 'points' | 'event';
type Platform = 'apple' | 'google';
type PassStatus = 'active' | 'revoked' | 'expired';

interface Template {
  id:            string;
  name:          string;
  pass_kind:     PassKind;
  status:        'published' | 'draft' | 'archived';
  primary_color: string | null;
  config_json:   Record<string, unknown>;
  is_repeatable: boolean;
  is_default:    boolean;
  valid_from:    string | null;
  valid_to:      string | null;
  created_at:    string;
  active_passes: number;
}

interface Customer {
  id:         string;
  first_name: string;
  last_name:  string;
  email:      string;
}

interface LoyaltySettings {
  points_per_scan:   number | null;
  reward_threshold:  number | null;
  reward_message:    string | null;
  stamps_total:      number | null;
  program_type:      string | null;
}

interface Pass {
  id:            string;
  platform:      Platform;
  status:        PassStatus;
  issued_at:     string;
  last_synced_at: string | null;
  sync_error:    string | null;
  object_id:     string | null;
  pass_version:  number | null;
  template: {
    id:         string;
    name:       string;
    pass_kind:  PassKind;
    is_default: boolean;
  } | null;
}

/* ── Tooltip helper ──────────────────────────────────────────────────────── */

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400 hover:text-primary-600 transition-colors cursor-help shrink-0">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="5" r="0.75" fill="currentColor" />
      </svg>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded-xl bg-gray-900 text-white text-xs leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg text-center">
        {text}
        <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-gray-900" />
      </span>
    </span>
  );
}

/* ── Module-scope sub-components ──────────────────────────────────────────── */

function useKindLabels(): Record<PassKind, string> {
  const { t } = useTranslation();
  return {
    stamps: t('wallet.kindStampsShort'),
    points: t('wallet.kindPointsShort'),
    event:  t('wallet.kindEvent'),
  };
}

const KIND_COLORS: Record<PassKind, string> = {
  stamps: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  points: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  event:  'bg-purple-50 text-purple-700 border-purple-200',
};

function KindBadge({ kind }: { kind: PassKind }) {
  const kindLabels = useKindLabels();
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${KIND_COLORS[kind] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {kindLabels[kind] ?? kind}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'published' ? 'bg-emerald-500' : status === 'draft' ? 'bg-gray-400' : 'bg-red-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function PassStatusBadge({ status }: { status: PassStatus }) {
  const { t } = useTranslation();
  const cls = status === 'active'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'revoked'
    ? 'bg-red-50 text-red-600'
    : 'bg-gray-100 text-gray-500';
  const label = status === 'active' ? t('wallet.passStatusActive') : status === 'revoked' ? t('wallet.passStatusRevoked') : t('wallet.passStatusExpired');
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function GoogleWalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12S7.86 19.5 12 19.5 19.5 16.14 19.5 12 16.14 4.5 12 4.5z" fill="white" fillOpacity="0.3"/>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white"/>
    </svg>
  );
}

/* ── Create Template Modal ────────────────────────────────────────────────── */

interface CreateTemplateModalProps {
  token:          string;
  restaurantId:   string;
  loyaltySettings: LoyaltySettings | null;
  onCreated:      (t: Template) => void;
  onClose:        () => void;
}

function CreateTemplateModal({ token, restaurantId, loyaltySettings, onCreated, onClose }: CreateTemplateModalProps) {
  const { t } = useTranslation();
  const [name,        setName]        = useState('');
  const [type,        setType]        = useState<PassKind>('stamps');
  const [color,       setColor]       = useState('#4f6bed');
  const [repeatable,  setRepeatable]  = useState(false);
  const [validFrom,   setValidFrom]   = useState('');
  const [validTo,     setValidTo]     = useState('');
  const [stampsTotal,     setStampsTotal]     = useState(loyaltySettings?.stamps_total     ?? 10);
  const [rewardMessage,   setRewardMessage]   = useState(loyaltySettings?.reward_message   ?? 'Café offert');
  const [rewardThreshold, setRewardThreshold] = useState(loyaltySettings?.reward_threshold ?? 500);
  const [pointsPerScan,   setPointsPerScan]   = useState(loyaltySettings?.points_per_scan  ?? 10);
  const [eventName,       setEventName]       = useState('');
  const [eventDate,       setEventDate]       = useState('');
  const [isDefault,   setIsDefault]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Silence unused var warning
  void restaurantId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const config_json: Record<string, unknown> =
      type === 'stamps' ? { stamps_total: stampsTotal, reward_message: rewardMessage } :
      type === 'points' ? { reward_threshold: rewardThreshold, points_per_scan: pointsPerScan, reward_message: rewardMessage } :
                          { event_name: eventName, event_date: eventDate };

    const res = await fetch('/api/wallet/templates', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        name, type, primary_color: color, is_repeatable: repeatable,
        is_default: isDefault,
        valid_from: validFrom || null, valid_to: validTo || null,
        config_json,
      }),
    });

    const json = await res.json();
    if (!res.ok) { setError(json.error ?? t('wallet.unknownError')); setSaving(false); return; }
    onCreated({ ...json.template, active_passes: 0 });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('wallet.createModalTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.templateNameLabel')}</label>
            <input
              required value={name} onChange={e => setName(e.target.value)}
              placeholder={t('wallet.templateNamePlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center">{t('wallet.headerType')}<InfoTooltip text={t('wallet.typeTooltip')} /></label>
            <select
              value={type} onChange={e => setType(e.target.value as PassKind)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="stamps">{t('wallet.kindStampsShort')}</option>
              <option value="points">{t('wallet.kindPointsShort')}</option>
              <option value="event">{t('wallet.kindEvent')}</option>
            </select>
          </div>

          {type === 'stamps' && (
            <div className="p-4 bg-indigo-50 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.stampsTotal')}</label>
                  <input type="number" min={1} max={20} value={stampsTotal} onChange={e => setStampsTotal(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.reward')}</label>
                  <input value={rewardMessage} onChange={e => setRewardMessage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              {loyaltySettings && (
                <p className="text-xs text-indigo-600">{t('wallet.syncedWithLoyalty')}</p>
              )}
            </div>
          )}
          {type === 'points' && (
            <div className="p-4 bg-emerald-50 rounded-xl space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.pointsPerScan')}</label>
                  <input type="number" min={1} value={pointsPerScan} onChange={e => setPointsPerScan(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.rewardThreshold')}</label>
                  <input type="number" min={1} value={rewardThreshold} onChange={e => setRewardThreshold(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.reward')}</label>
                  <input value={rewardMessage} onChange={e => setRewardMessage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              {loyaltySettings && (
                <p className="text-xs text-emerald-700">{t('wallet.syncedWithLoyalty')}</p>
              )}
            </div>
          )}
          {type === 'event' && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-purple-50 rounded-xl">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.eventName')}</label>
                <input value={eventName} onChange={e => setEventName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.date')}</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.colorLabel')}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="h-9 w-16 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                <span className="text-sm text-gray-500 font-mono">{color}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="repeatable" checked={repeatable} onChange={e => setRepeatable(e.target.checked)}
                className="rounded" />
              <label htmlFor="repeatable" className="text-sm text-gray-700">{t('wallet.repeatableLabel2')}</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.validFromLabel2')} <span className="text-gray-400 font-normal">{t('common.optional')}</span></label>
              <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.expiresLabel')} <span className="text-gray-400 font-normal">{t('common.optional')}</span></label>
              <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="rounded mt-0.5"
            />
            <div>
              <label htmlFor="isDefault" className="text-sm text-gray-700 font-medium cursor-pointer inline-flex items-center">
                {t('wallet.isDefaultLabel2')}<InfoTooltip text={t('wallet.isDefaultTooltip')} />
              </label>
              <p className="text-xs text-gray-500 mt-0.5">{t('wallet.isDefaultHint')}</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
              {saving ? t('wallet.createSaving') : t('wallet.createBtn2')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Edit Template Modal ──────────────────────────────────────────────────── */

interface EditTemplateModalProps {
  template:        Template;
  token:           string;
  loyaltySettings: LoyaltySettings | null;
  onUpdated:       (t: Template) => void;
  onClose:         () => void;
}

function EditTemplateModal({ template, token, loyaltySettings, onUpdated, onClose }: EditTemplateModalProps) {
  const { t } = useTranslation();
  const cfg = template.config_json ?? {};
  const [name,            setName]            = useState(template.name);
  const [color,           setColor]           = useState(template.primary_color ?? '#4f6bed');
  const [repeatable,      setRepeatable]      = useState(template.is_repeatable);
  const [validFrom,       setValidFrom]       = useState(template.valid_from?.slice(0, 10) ?? '');
  const [validTo,         setValidTo]         = useState(template.valid_to?.slice(0, 10) ?? '');
  const [stampsTotal,     setStampsTotal]     = useState(Number(cfg.stamps_total     ?? loyaltySettings?.stamps_total     ?? 10));
  const [rewardMessage,   setRewardMessage]   = useState(String(cfg.reward_message   ?? loyaltySettings?.reward_message   ?? 'Café offert'));
  const [rewardThreshold, setRewardThreshold] = useState(Number(cfg.reward_threshold ?? loyaltySettings?.reward_threshold ?? 500));
  const [pointsPerScan,   setPointsPerScan]   = useState(Number(cfg.points_per_scan  ?? loyaltySettings?.points_per_scan  ?? 10));
  const [eventName,       setEventName]       = useState(String(cfg.event_name ?? ''));
  const [eventDate,       setEventDate]       = useState(String(cfg.event_date ?? ''));
  const [isDefault,       setIsDefault]       = useState(template.is_default ?? false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const config_json: Record<string, unknown> =
      template.pass_kind === 'stamps' ? { stamps_total: stampsTotal, reward_message: rewardMessage } :
      template.pass_kind === 'points' ? { reward_threshold: rewardThreshold, points_per_scan: pointsPerScan, reward_message: rewardMessage } :
                                         { event_name: eventName, event_date: eventDate };

    const res = await fetch(`/api/wallet/templates/${template.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        name,
        primary_color: color,
        is_repeatable: repeatable,
        is_default: isDefault,
        valid_from: validFrom || null,
        valid_to:   validTo   || null,
        config_json,
      }),
    });

    const json = await res.json();
    if (!res.ok) { setError(json.error ?? t('wallet.unknownError')); setSaving(false); return; }
    onUpdated({ ...template, ...json.template });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('wallet.editModalTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.templateNameLabel')}</label>
            <input
              required value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Type is read-only on edit */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
            <KindBadge kind={template.pass_kind} />
            <span className="text-xs text-gray-500">{t('wallet.typeReadonly')}</span>
          </div>

          {template.pass_kind === 'stamps' && (
            <div className="p-4 bg-indigo-50 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.stampsTotal')}</label>
                  <input type="number" min={1} max={20} value={stampsTotal} onChange={e => setStampsTotal(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.reward')}</label>
                  <input value={rewardMessage} onChange={e => setRewardMessage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
            </div>
          )}
          {template.pass_kind === 'points' && (
            <div className="p-4 bg-emerald-50 rounded-xl space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.pointsPerScan')}</label>
                  <input type="number" min={1} value={pointsPerScan} onChange={e => setPointsPerScan(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.rewardThreshold')}</label>
                  <input type="number" min={1} value={rewardThreshold} onChange={e => setRewardThreshold(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.reward')}</label>
                  <input value={rewardMessage} onChange={e => setRewardMessage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
            </div>
          )}
          {template.pass_kind === 'event' && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-purple-50 rounded-xl">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('wallet.eventName')}</label>
                <input value={eventName} onChange={e => setEventName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.date')}</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.colorLabel')}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="h-9 w-16 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                <span className="text-sm text-gray-500 font-mono">{color}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="edit-repeatable" checked={repeatable} onChange={e => setRepeatable(e.target.checked)}
                className="rounded" />
              <label htmlFor="edit-repeatable" className="text-sm text-gray-700">{t('wallet.repeatableLabel2')}</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.validFromLabel2')} <span className="text-gray-400 font-normal">{t('common.optional')}</span></label>
              <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.expiresLabel')} <span className="text-gray-400 font-normal">{t('common.optional')}</span></label>
              <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <input
              type="checkbox"
              id="edit-isDefault"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="rounded mt-0.5"
            />
            <div>
              <label htmlFor="edit-isDefault" className="text-sm text-gray-700 font-medium cursor-pointer inline-flex items-center">
                {t('wallet.isDefaultLabel2')}<InfoTooltip text={t('wallet.isDefaultTooltip')} />
              </label>
              <p className="text-xs text-gray-500 mt-0.5">{t('wallet.isDefaultHint')}</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
              {saving ? t('wallet.editSaving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Issue Pass Modal ─────────────────────────────────────────────────────── */

interface IssuePassModalProps {
  token:      string;
  templates:  Template[];
  customers:  Customer[];
  onIssued:   (passId: string) => void;
  onClose:    () => void;
  preselectedTemplateId?: string;
}

function IssuePassModal({ token, templates, customers, onIssued, onClose, preselectedTemplateId }: IssuePassModalProps) {
  const { t } = useTranslation();
  const kindLabels = useKindLabels();
  const published = templates.filter(t => t.status === 'published');

  const [templateId,    setTemplateId]    = useState(preselectedTemplateId ?? published[0]?.id ?? '');
  const [customerId,    setCustomerId]    = useState(customers[0]?.id ?? '');
  const [platform,      setPlatform]      = useState<Platform>('apple');
  const [customerQ,     setCustomerQ]     = useState('');
  const [issuing,       setIssuing]       = useState(false);
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState('');
  const [issuedPassId,  setIssuedPassId]  = useState<string | null>(null);
  const [saveUrl,       setSaveUrl]       = useState<string | null>(null);

  const filtered = customers.filter(c => {
    const q = customerQ.toLowerCase();
    return !q || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId || !customerId) return;
    setIssuing(true);
    setError('');
    setSuccess('');
    setSaveUrl(null);

    const res = await fetch('/api/wallet/passes/issue', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ templateId, customerId, platform }),
    });

    const json = await res.json();
    setIssuing(false);

    if (!res.ok) { setError(json.error ?? t('wallet.unknownError')); return; }
    setSuccess(t('wallet.issueSuccess'));
    setIssuedPassId(json.pass.id);
    if (json.saveUrl) setSaveUrl(json.saveUrl);
    onIssued(json.pass.id);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('wallet.issueTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.issueTemplateLabel')}</label>
            {published.length === 0 ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                {t('wallet.noPublishedTemplate')}
              </p>
            ) : (
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {published.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({kindLabels[t.pass_kind] ?? t.pass_kind})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet.issueClientLabel2')}</label>
            <input
              placeholder={t('wallet.issueSearchPlaceholder')} value={customerQ} onChange={e => setCustomerQ(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {customers.length === 0 ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{t('wallet.noClientFound')}</p>
            ) : (
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} size={4}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {filtered.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name} — {c.email}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('wallet.issuePlatformLabel2')}</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPlatform('apple')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${platform === 'apple' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                {t('wallet.appleWallet')}
              </button>
              <button type="button" disabled
                className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-100 text-gray-400 bg-gray-50 cursor-not-allowed"
                title="Google Wallet bientôt disponible">
                {t('wallet.googleWalletSoon')}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && (
            <div className="bg-emerald-50 rounded-xl px-4 py-3 space-y-3">
              <p className="text-sm font-medium text-emerald-700">{success}</p>
              {issuedPassId && platform === 'apple' && (
                <div className="space-y-1">
                  <p className="text-xs text-emerald-600">{t('wallet.issueOpenIphone')}</p>
                  <AddToAppleWalletButton passId={issuedPassId} />
                </div>
              )}
              {issuedPassId && platform === 'google' && saveUrl && (
                <div className="space-y-1">
                  <p className="text-xs text-emerald-600">{t('wallet.issueClickGoogle')}</p>
                  <a
                    href={saveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
                  >
                    <GoogleWalletIcon />
                    {t('wallet.addToGoogleWallet')}
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              {t('common.close')}
            </button>
            <button type="submit" disabled={issuing || !templateId || !customerId || published.length === 0}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
              {issuing ? t('wallet.issuing') : t('wallet.issueBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Templates Table ──────────────────────────────────────────────────────── */

interface TemplatesTableProps {
  templates:    Template[];
  token:        string;
  onIssue:      (templateId: string) => void;
  onSetDefault: (templateId: string) => void;
  onEdit:       (template: Template) => void;
  onArchive:    (templateId: string) => void;
}

interface TemplatePassEntry {
  id:         string;
  status:     PassStatus;
  platform:   Platform;
  issued_at:  string;
  customer: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
    total_points:  number;
    stamps_count:  number;
  } | null;
}

function TemplatesTable({ templates, token, onIssue, onSetDefault, onEdit, onArchive }: TemplatesTableProps) {
  const { t, locale } = useTranslation();
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [archiving,      setArchiving]      = useState<string | null>(null);
  const [archiveErr,     setArchiveErr]     = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templatePasses,     setTemplatePasses]     = useState<TemplatePassEntry[]>([]);
  const [loadingPasses,      setLoadingPasses]      = useState(false);
  const [passesErr,          setPassesErr]          = useState<string | null>(null);

  const visible = templates.filter(t => t.status !== 'archived');

  async function toggleTemplatePasses(templateId: string) {
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId(null);
      setTemplatePasses([]);
      return;
    }
    setSelectedTemplateId(templateId);
    setLoadingPasses(true);
    setPassesErr(null);
    setTemplatePasses([]);

    const { data, error } = await supabase
      .from('wallet_passes')
      .select(`
        id,
        status,
        platform,
        issued_at,
        customer:customers (
          id,
          first_name,
          last_name,
          email,
          total_points,
          stamps_count
        )
      `)
      .eq('template_id', templateId)
      .eq('status', 'active')
      .order('issued_at', { ascending: false });

    setLoadingPasses(false);
    if (error) {
      setPassesErr(error.message);
      return;
    }
    setTemplatePasses((data ?? []) as unknown as TemplatePassEntry[]);
  }

  async function handleSetDefault(templateId: string) {
    setSettingDefault(templateId);
    await fetch(`/api/wallet/templates/${templateId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ is_default: true }),
    });
    setSettingDefault(null);
    onSetDefault(templateId);
  }

  async function handleArchive(tmpl: Template) {
    if (!confirm(t('wallet.confirmArchive', { name: tmpl.name }))) return;
    setArchiving(tmpl.id);
    setArchiveErr(null);
    const res  = await fetch(`/api/wallet/templates/${tmpl.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ status: 'archived' }),
    });
    const json = await res.json();
    setArchiving(null);
    if (!res.ok) { setArchiveErr(json.error ?? t('common.error')); return; }
    onArchive(tmpl.id);
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center">
        <p className="text-gray-400 text-sm">{t('wallet.noTemplatesYet')}</p>
        <p className="text-gray-400 text-xs mt-1">{t('wallet.clickNewTemplate')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {archiveErr && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{archiveErr}</p>
      )}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">{t('wallet.tableHeaderName')}</th>
              <th className="px-4 py-3 text-left"><span className="inline-flex items-center">{t('wallet.tableHeaderType')}<InfoTooltip text={t('wallet.tableHeaderTypeTooltip')} /></span></th>
              <th className="px-4 py-3 text-left"><span className="inline-flex items-center">{t('wallet.tableHeaderStatus')}<InfoTooltip text={t('wallet.tableHeaderStatusTooltip')} /></span></th>
              <th className="px-4 py-3 text-right">{t('wallet.tableHeaderActivePasses')}</th>
              <th className="px-4 py-3 text-left">{t('wallet.tableHeaderValidUntil')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(tmpl => (
              <React.Fragment key={tmpl.id}>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <div className="flex items-center gap-2 flex-wrap">
                    {tmpl.primary_color && (
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tmpl.primary_color }} />
                    )}
                    {tmpl.name}
                    {tmpl.is_default && (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 inline-flex items-center">{t('wallet.defaultBadge')}<InfoTooltip text={t('wallet.defaultBadgeTooltip')} /></span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3"><KindBadge kind={tmpl.pass_kind} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={tmpl.status} />
                    <span className="text-gray-600 capitalize">{tmpl.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => tmpl.active_passes > 0 && toggleTemplatePasses(tmpl.id)}
                    disabled={tmpl.active_passes === 0}
                    className={`inline-flex items-center gap-1 font-semibold transition-colors ${
                      tmpl.active_passes > 0
                        ? 'text-primary-600 hover:text-primary-700 cursor-pointer'
                        : 'text-gray-400 cursor-default'
                    }`}
                    title={tmpl.active_passes > 0 ? 'Voir les passes actifs' : ''}
                  >
                    {tmpl.active_passes}
                    {tmpl.active_passes > 0 && (
                      <svg
                        width="14" height="14" viewBox="0 0 16 16" fill="none"
                        className={`transition-transform duration-200 ${selectedTemplateId === tmpl.id ? 'rotate-180' : ''}`}
                      >
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {tmpl.valid_to ? new Date(tmpl.valid_to).toLocaleDateString(locale) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {!tmpl.is_default && tmpl.status === 'published' && (
                      <button
                        onClick={() => handleSetDefault(tmpl.id)}
                        disabled={settingDefault === tmpl.id}
                        className="text-xs text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                      >
                        {settingDefault === tmpl.id ? '…' : t('wallet.setDefault')}
                      </button>
                    )}
                    <button
                      onClick={() => onEdit(tmpl)}
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-full transition-colors"
                    >
                      {t('common.edit')}
                    </button>
                    {tmpl.active_passes === 0 && (
                      <button
                        onClick={() => handleArchive(tmpl)}
                        disabled={archiving === tmpl.id}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                      >
                        {archiving === tmpl.id ? '…' : t('common.archive')}
                      </button>
                    )}
                    {tmpl.status === 'published' && (
                      <button
                        onClick={() => onIssue(tmpl.id)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-full transition-colors"
                      >
                        {t('wallet.issueArrow')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {/* ── Expandable pass list panel ── */}
              {selectedTemplateId === tmpl.id && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <div className="bg-gray-50 border-t border-gray-100 px-6 py-4">
                      {loadingPasses && (
                        <p className="text-sm text-gray-500 py-2">{t('wallet.loadingPasses')}</p>
                      )}
                      {passesErr && (
                        <p className="text-sm text-danger-600 bg-red-50 rounded-lg px-3 py-2">{passesErr}</p>
                      )}
                      {!loadingPasses && !passesErr && templatePasses.length === 0 && (
                        <p className="text-sm text-gray-400 py-2">{t('wallet.noActivePass')}</p>
                      )}
                      {!loadingPasses && !passesErr && templatePasses.length > 0 && (
                        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              <tr>
                                <th className="px-4 py-2.5 text-left">{t('wallet.tableClientHeader')}</th>
                                <th className="px-4 py-2.5 text-left">{t('wallet.tableEmailHeader')}</th>
                                <th className="px-4 py-2.5 text-left">{t('wallet.tableStatusHeader')}</th>
                                <th className="px-4 py-2.5 text-left">{t('wallet.tableIssuedHeader')}</th>
                                <th className="px-4 py-2.5 text-right">
                                  {tmpl.pass_kind === 'stamps' ? t('wallet.kindStampsShort') : t('wallet.kindPointsShort')}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {templatePasses.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-2.5 text-gray-900 font-medium">
                                    {p.customer
                                      ? `${p.customer.first_name} ${p.customer.last_name}`
                                      : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-500">
                                    {p.customer?.email ?? '—'}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <PassStatusBadge status={p.status} />
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-500">
                                    {new Date(p.issued_at).toLocaleDateString(locale)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                                    {p.customer
                                      ? (tmpl.pass_kind === 'stamps'
                                          ? p.customer.stamps_count
                                          : p.customer.total_points)
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Customer Passes Panel ────────────────────────────────────────────────── */

interface CustomerPassesPanelProps {
  token:     string;
  customers: Customer[];
}

function CustomerPassesPanel({ token, customers }: CustomerPassesPanelProps) {
  const { t, locale } = useTranslation();
  const [customerQ,      setCustomerQ]      = useState('');
  const [selectedId,     setSelectedId]     = useState('');
  const [passes,         setPasses]         = useState<Pass[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [revoking,       setRevoking]       = useState<string | null>(null);
  const [syncing,        setSyncing]        = useState<string | null>(null);
  const [reissuing,      setReissuing]      = useState<string | null>(null);
  const [actionErr,      setActionErr]      = useState<string | null>(null);

  const filtered = customers.filter(c => {
    const q = customerQ.toLowerCase();
    return !q || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q);
  });

  async function loadPasses(customerId: string) {
    setSelectedId(customerId);
    setLoading(true);
    setActionErr(null);
    const res  = await fetch(`/api/wallet/passes?customerId=${customerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setLoading(false);
    if (res.ok) setPasses(json.passes ?? []);
  }

  async function handleRevoke(passId: string) {
    if (!confirm(t('wallet.confirmRevoke'))) return;
    setRevoking(passId);
    setActionErr(null);
    const res  = await fetch(`/api/wallet/passes/${passId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action: 'revoke' }),
    });
    const json = await res.json();
    setRevoking(null);
    if (!res.ok) { setActionErr(json.error ?? t('common.error')); return; }
    setPasses(prev => prev.map(p => p.id === passId ? { ...p, status: 'revoked' } : p));
  }

  async function handleSync(passId: string) {
    setSyncing(passId);
    setActionErr(null);
    const res  = await fetch(`/api/wallet/passes/${passId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action: 'sync' }),
    });
    const json = await res.json();
    setSyncing(null);
    if (!res.ok) { setActionErr(json.error ?? t('common.error')); return; }
    const now = new Date().toISOString();
    setPasses(prev => prev.map(p =>
      p.id === passId
        ? { ...p, last_synced_at: json.synced ? now : p.last_synced_at, sync_error: json.syncError }
        : p,
    ));
  }

  async function handleReissue(pass: Pass) {
    if (!pass.template) return;
    setReissuing(pass.id);
    setActionErr(null);
    const res = await fetch('/api/wallet/passes/issue', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        customerId: selectedId,
        templateId: pass.template.id,
        platform:   pass.platform,
      }),
    });
    const json = await res.json();
    setReissuing(null);
    if (!res.ok) { setActionErr(json.error ?? t('wallet.reissueError')); return; }
    // Refresh the full passes list to show the new active pass
    await loadPasses(selectedId);
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-1">{t('wallet.issuedPassesTitle')}</h2>
      <p className="text-sm text-gray-500 mb-4">{t('wallet.issuedPassesDesc')}</p>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {/* Customer search */}
        <div className="p-4 border-b border-gray-100">
          <input
            placeholder={t('wallet.issueSearchPlaceholder')}
            value={customerQ}
            onChange={e => setCustomerQ(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {customerQ && filtered.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCustomerQ(`${c.first_name} ${c.last_name}`); loadPasses(c.id); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                >
                  <span className="font-medium">{c.first_name} {c.last_name}</span>
                  <span className="text-gray-400 ml-2">{c.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Passes list */}
        <div className="p-4">
          {!selectedId && (
            <p className="text-sm text-gray-400 text-center py-4">{t('wallet.selectClient')}</p>
          )}

          {loading && (
            <p className="text-sm text-gray-400 text-center py-4">{t('common.loading')}</p>
          )}

          {actionErr && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{actionErr}</p>
          )}

          {!loading && selectedId && passes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{t('wallet.noPassesClient')}</p>
          )}

          {!loading && passes.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('wallet.tablePlatform')}</th>
                    <th className="px-3 py-2 text-left">{t('wallet.tableTemplate')}</th>
                    <th className="px-3 py-2 text-left">{t('wallet.tableStatusHeader')}</th>
                    <th className="px-3 py-2 text-left">{t('wallet.tableIssuedHeader')}</th>
                    <th className="px-3 py-2 text-left">{t('wallet.tableSync')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {passes.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-lg">{p.platform === 'apple' ? '🍎' : '🟢'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {p.template?.name ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <PassStatusBadge status={p.status} />
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">
                        {p.issued_at ? new Date(p.issued_at).toLocaleDateString(locale) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {p.platform === 'google' ? (
                          p.last_synced_at
                            ? <span className="text-gray-500">{new Date(p.last_synced_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</span>
                            : <span className="text-amber-600">{t('wallet.syncNever')}</span>
                        ) : (
                          <span className="text-gray-400">{t('wallet.syncLive')}</span>
                        )}
                        {p.sync_error && (
                          <span className="ml-1 text-red-500" title={p.sync_error}>⚠</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status === 'active' && (
                            <button
                              onClick={() => handleRevoke(p.id)}
                              disabled={revoking === p.id}
                              className="text-xs text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-2 py-1 rounded-full transition-colors"
                            >
                              {revoking === p.id ? '…' : t('wallet.revokeBtn')}
                            </button>
                          )}
                          {p.status === 'active' && p.platform === 'google' && p.object_id && (
                            <button
                              onClick={() => handleSync(p.id)}
                              disabled={syncing === p.id}
                              className="text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-2 py-1 rounded-full transition-colors"
                            >
                              {syncing === p.id ? '…' : t('wallet.syncBtn')}
                            </button>
                          )}
                          {(p.status === 'revoked' || p.status === 'expired') && p.template && (
                            <button
                              onClick={() => handleReissue(p)}
                              disabled={reissuing === p.id}
                              className="text-xs text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 px-2 py-1 rounded-xl transition-colors"
                            >
                              {reissuing === p.id ? '…' : t('wallet.reissueBtn')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Test Apple Wallet Button ─────────────────────────────────────────────── */

function TestAppleWalletButton({ token }: { token: string }) {
  const { t } = useTranslation();
  const [loading, setLoading]   = useState(false);
  const [passId,  setPassId]    = useState<string | null>(null);
  const [err,     setErr]       = useState('');

  async function runTest() {
    setLoading(true);
    setErr('');
    setPassId(null);
    const res  = await fetch('/api/wallet/passes/test-issue', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(json.error ?? t('common.error')); return; }
    setPassId(json.passId);
  }

  if (passId) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-gray-500">{t('wallet.openIphone')}</p>
        <AddToAppleWalletButton passId={passId} />
        <button
          onClick={() => setPassId(null)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {t('wallet.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={runTest}
        disabled={loading || !token}
        className="flex items-center gap-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? t('wallet.generating') : t('wallet.testIphone')}
      </button>
      {err && (
        <div className="text-xs max-w-xs">
          <p className="text-red-600">{err}</p>
          {err.includes('configuré') && (
            <p className="text-gray-500 mt-1">
              {t('wallet.appleSetupHint')}{' '}
              <a href="https://developer.apple.com/account/resources/identifiers/list/passTypeId" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                {t('wallet.appleDevConsole')}
              </a>
              {t('wallet.appleSetupHint2')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Google Class Sync Button ─────────────────────────────────────────────── */

function GoogleClassSyncButton({ token }: { token: string }) {
  const { t } = useTranslation();
  const [syncing, setSyncing]   = useState(false);
  const [result,  setResult]    = useState<{ synced: number; failed: number } | null>(null);
  const [err,     setErr]       = useState('');

  async function runSync() {
    setSyncing(true);
    setErr('');
    setResult(null);
    const res  = await fetch('/api/wallet/classes/sync', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setSyncing(false);
    if (!res.ok) { setErr(json.error ?? t('common.error')); return; }
    setResult({ synced: json.synced, failed: json.failed });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={runSync}
        disabled={syncing || !token}
        className="flex items-center gap-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {syncing ? t('wallet.syncing') : t('wallet.syncClasses')}
      </button>
      {result && (
        <p className={`text-xs ${result.failed > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {t('wallet.classesSynced', { count: result.synced })}
          {result.failed > 0 ? t('wallet.classesFailed', { count: result.failed }) : ''}
        </p>
      )}
      {err && <p className="text-xs text-red-600 max-w-xs">{err}</p>}
    </div>
  );
}

function RecoverPassesButton({ token }: { token: string }) {
  const { t } = useTranslation();
  const [recovering, setRecovering] = useState(false);
  const [result,     setResult]     = useState<{ recovered: number; failed: number; skipped: number } | null>(null);
  const [err,        setErr]        = useState('');

  async function runRecover() {
    setRecovering(true);
    setErr('');
    setResult(null);
    const res  = await fetch('/api/wallet/passes/recover', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setRecovering(false);
    if (!res.ok) { setErr(json.error ?? t('common.error')); return; }
    setResult({ recovered: json.recovered, failed: json.failed, skipped: json.skipped });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={runRecover}
        disabled={recovering || !token}
        className="flex items-center gap-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {recovering ? t('wallet.recovering') : t('wallet.recoverPasses')}
      </button>
      {result !== null && (
        <p className={`text-xs ${result.failed > 0 ? 'text-amber-600' : result.recovered === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>
          {result.recovered === 0 && result.failed === 0
            ? t('wallet.nothingToRecover')
            : `${t('wallet.recovered', { count: result.recovered })}${result.failed > 0 ? t('wallet.classesFailed', { count: result.failed }) : ''}`
          }
        </p>
      )}
      {err && <p className="text-xs text-red-600 max-w-xs">{err}</p>}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function WalletStudioPage() {
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const { ready: subReady } = useSubscriptionGate();

  const [token,        setToken]        = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [templates,    setTemplates]    = useState<Template[]>([]);
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [planBlocked,  setPlanBlocked]  = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [showIssue,    setShowIssue]    = useState(false);
  const [issueTemplateId, setIssueTemplateId] = useState<string | undefined>(undefined);
  const [issuedCount,  setIssuedCount]  = useState(0);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Silence unused var warning for restaurantId
  void restaurantId;

  const fetchTemplates = useCallback(async (tk: string): Promise<Template[]> => {
    const res = await fetch('/api/wallet/templates', {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.templates ?? []) as Template[];
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/dashboard/login'); return; }
      const tk = session.access_token;

      const meRes = await fetch('/api/me', { headers: { Authorization: `Bearer ${tk}` } });
      const me = await meRes.json();

      // Role check: non-owner roles are never allowed (redirect silently)
      if (me.platformRole !== 'owner') { router.replace('/dashboard'); return; }

      // Plan check: free-plan restaurants cannot access Wallet Studio via direct URL.
      // me.walletStudio = true when plan !== 'free' OR wallet_studio_enabled = true (manual override).
      if (!me.walletStudio) { setPlanBlocked(true); setLoading(false); return; }

      setToken(tk);
      setRestaurantId(me.restaurantId ?? '');

      const [tmplData, restoData, custData, loyaltyRes] = await Promise.all([
        fetchTemplates(tk),
        supabase
          .from('restaurants')
          .select('name')
          .eq('id', me.restaurantId)
          .maybeSingle(),
        supabase
          .from('customers')
          .select('id, first_name, last_name, email')
          .eq('restaurant_id', me.restaurantId)
          .order('last_name', { ascending: true }),
        fetch('/api/loyalty-settings', { headers: { Authorization: `Bearer ${tk}` } }),
      ]);

      setTemplates(tmplData);
      setRestaurantName(restoData.data?.name ?? '');
      setCustomers(custData.data ?? []);

      if (loyaltyRes.ok) {
        const loyaltyJson = await loyaltyRes.json();
        setLoyaltySettings(loyaltyJson.settings ?? null);
      }
      setLoading(false);
    }

    init().catch(err => { setError(String(err)); setLoading(false); });
  }, [router, fetchTemplates]);

  useEffect(() => {
    if (issuedCount > 0 && token) {
      fetchTemplates(token).then(tmpl => setTemplates(tmpl)).catch(() => {});
    }
  }, [issuedCount, token, fetchTemplates]);

  /* ── Render states ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">{t('wallet.loadingStudio')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white shadow p-8 max-w-sm w-full text-center">
          <p className="text-red-600 font-medium mb-2">{t('wallet.errorTitle')}</p>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-indigo-600 hover:underline">
            {t('wallet.backDashboard')}
          </button>
        </div>
      </div>
    );
  }

  if (planBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-2xl">
            🔒
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">{t('wallet.planBlockedTitle')}</h2>
            <p className="text-sm text-gray-500">
              {t('wallet.planBlockedDesc')}
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-primary-600 hover:text-primary-800 underline transition-colors"
          >
            {t('wallet.backDashboard')}
          </button>
        </div>
      </div>
    );
  }

  const visibleTemplates = templates.filter(t => t.status !== 'archived');

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => router.push('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          {t('wallet.backDashboard')}
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">{t('wallet.title')}</h1>
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
            {t('wallet.platformOwnerBadge')}
          </span>
          {restaurantName && (
            <span className="text-xs text-gray-500">{restaurantName}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => router.push('/admin/wallet-preview')}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            {t('wallet.cardEditorLink')}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ── Templates section ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 inline-flex items-center">{t('wallet.templatesTitle')}<InfoTooltip text={t('wallet.templatesDesc')} /></h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {visibleTemplates.length === 0
                  ? t('wallet.firstTemplateHint')
                  : t('wallet.templateCount', { count: visibleTemplates.length, passes: visibleTemplates.reduce((s, tmpl) => s + tmpl.active_passes, 0) })}
              </p>
            </div>
            <div className="flex gap-2">
              {visibleTemplates.some(t => t.status === 'published') && (
                <button
                  onClick={() => { setIssueTemplateId(undefined); setShowIssue(true); }}
                  className="flex items-center gap-1.5 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {t('wallet.emitPass')}
                </button>
              )}
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {t('wallet.newTemplate')}
              </button>
            </div>
          </div>

          <TemplatesTable
            templates={templates}
            token={token}
            onIssue={(id) => { setIssueTemplateId(id); setShowIssue(true); }}
            onSetDefault={() => fetchTemplates(token).then(tmpl => setTemplates(tmpl)).catch(() => {})}
            onEdit={(t) => setEditingTemplate(t)}
            onArchive={(id) => setTemplates(prev => prev.filter(t => t.id !== id))}
          />
        </section>

        {/* ── Quick stats ── */}
        {visibleTemplates.length > 0 && (
          <section className="grid grid-cols-3 gap-4">
            {[
              {
                label: t('wallet.statActiveTemplates'),
                value: visibleTemplates.filter(tmpl => tmpl.status === 'published').length,
                color: 'text-emerald-700 bg-emerald-50',
              },
              {
                label: t('wallet.statActivePasses'),
                value: visibleTemplates.reduce((s, tmpl) => s + tmpl.active_passes, 0),
                color: 'text-indigo-700 bg-indigo-50',
              },
              {
                label: t('wallet.statRegisteredClients'),
                value: customers.length,
                color: 'text-gray-700 bg-gray-50',
              },
            ].map(stat => (
              <div key={stat.label} className={`rounded-xl px-5 py-4 ${stat.color}`}>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm opacity-80 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </section>
        )}

        {/* ── Customer Passes Panel ── */}
        {customers.length > 0 && (
          <CustomerPassesPanel token={token} customers={customers} />
        )}

        {/* ── Apple Wallet + Google Wallet live section ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            {t('wallet.digitalPasses')}
          </h2>
          <div className="space-y-3">
            {/* Apple Wallet */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🍎</span>
                  <h3 className="font-semibold text-gray-900 text-sm">{t('wallet.applePassesTitle')}</h3>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {t('wallet.appleActiveLabel')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                  {t('wallet.applePassesDesc')}
                </p>
              </div>
              <TestAppleWalletButton token={token} />
            </div>

            {/* Google Wallet */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row sm:items-start gap-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🟢</span>
                  <h3 className="font-semibold text-gray-900 text-sm">{t('wallet.googleWalletTitle')}</h3>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {t('wallet.googleActiveLabel')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                  {t('wallet.googleWalletDesc')}
                </p>
              </div>
              <div className="flex flex-col gap-3 shrink-0">
                <GoogleClassSyncButton token={token} />
                <RecoverPassesButton token={token} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Roadmap / placeholders — only Analytics remains ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            {t('wallet.upcomingFeatures')}
          </h2>
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-5 flex gap-3">
            <span className="text-2xl shrink-0">📊</span>
            <div>
              <h3 className="font-semibold text-gray-700 text-sm mb-1">{t('wallet.analyticsTitle')}</h3>
              <p className="text-xs text-gray-500">{t('wallet.analyticsDesc')}</p>
              <span className="inline-block mt-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t('wallet.soonBadge')}</span>
            </div>
          </div>
        </section>

      </main>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateTemplateModal
          token={token}
          restaurantId={restaurantId}
          loyaltySettings={loyaltySettings}
          onCreated={t => { setTemplates(prev => [t, ...prev]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showIssue && (
        <IssuePassModal
          token={token}
          templates={templates}
          customers={customers}
          preselectedTemplateId={issueTemplateId}
          onIssued={() => setIssuedCount(n => n + 1)}
          onClose={() => setShowIssue(false)}
        />
      )}

      {editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          token={token}
          loyaltySettings={loyaltySettings}
          onUpdated={(updated) => {
            setTemplates(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
            setEditingTemplate(null);
          }}
          onClose={() => setEditingTemplate(null)}
        />
      )}

    </div>
  );
}
