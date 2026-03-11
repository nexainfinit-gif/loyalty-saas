'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSubscriptionGate } from '@/lib/use-subscription-gate';
import AddToAppleWalletButton from '@/components/AddToAppleWalletButton';

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

/* ── Module-scope sub-components ──────────────────────────────────────────── */

const KIND_LABELS: Record<PassKind, string> = {
  stamps: 'Tampons',
  points: 'Points',
  event:  'Événement',
};

const KIND_COLORS: Record<PassKind, string> = {
  stamps: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  points: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  event:  'bg-purple-50 text-purple-700 border-purple-200',
};

function KindBadge({ kind }: { kind: PassKind }) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${KIND_COLORS[kind] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'published' ? 'bg-emerald-500' : status === 'draft' ? 'bg-gray-400' : 'bg-red-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function PassStatusBadge({ status }: { status: PassStatus }) {
  const cls = status === 'active'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'revoked'
    ? 'bg-red-50 text-red-600'
    : 'bg-gray-100 text-gray-500';
  const label = status === 'active' ? 'Actif' : status === 'revoked' ? 'Révoqué' : 'Expiré';
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
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); setSaving(false); return; }
    onCreated({ ...json.template, active_passes: 0 });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Nouveau template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du template</label>
            <input
              required value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex. Carte fidélité tampons 2025"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type} onChange={e => setType(e.target.value as PassKind)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="stamps">Tampons</option>
              <option value="points">Points</option>
              <option value="event">Événement</option>
            </select>
          </div>

          {type === 'stamps' && (
            <div className="p-4 bg-indigo-50 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tampons total</label>
                  <input type="number" min={1} max={20} value={stampsTotal} onChange={e => setStampsTotal(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Récompense</label>
                  <input value={rewardMessage} onChange={e => setRewardMessage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              {loyaltySettings && (
                <p className="text-xs text-indigo-600">Valeurs synchronisées avec vos paramètres de fidélité actuels</p>
              )}
            </div>
          )}
          {type === 'points' && (
            <div className="p-4 bg-emerald-50 rounded-xl space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Points / scan</label>
                  <input type="number" min={1} value={pointsPerScan} onChange={e => setPointsPerScan(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Seuil récompense</label>
                  <input type="number" min={1} value={rewardThreshold} onChange={e => setRewardThreshold(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Récompense</label>
                  <input value={rewardMessage} onChange={e => setRewardMessage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              {loyaltySettings && (
                <p className="text-xs text-emerald-700">Valeurs synchronisées avec vos paramètres de fidélité actuels</p>
              )}
            </div>
          )}
          {type === 'event' && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-purple-50 rounded-xl">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom de l&apos;événement</label>
                <input value={eventName} onChange={e => setEventName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Couleur principale</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="h-9 w-16 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                <span className="text-sm text-gray-500 font-mono">{color}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="repeatable" checked={repeatable} onChange={e => setRepeatable(e.target.checked)}
                className="rounded" />
              <label htmlFor="repeatable" className="text-sm text-gray-700">Pass répétable</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valide à partir du <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expire le <span className="text-gray-400 font-normal">(optionnel)</span></label>
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
              <label htmlFor="isDefault" className="text-sm text-gray-700 font-medium cursor-pointer">
                Utiliser comme template par défaut (auto-attribution au client)
              </label>
              <p className="text-xs text-gray-500 mt-0.5">Un seul template peut être le template par défaut.</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
              {saving ? 'Création…' : 'Créer le template'}
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
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); setSaving(false); return; }
    onUpdated({ ...template, ...json.template });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Modifier le template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du template</label>
            <input
              required value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Type is read-only on edit */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
            <KindBadge kind={template.pass_kind} />
            <span className="text-xs text-gray-500">Le type ne peut pas être modifié après création.</span>
          </div>

          {template.pass_kind === 'stamps' && (
            <div className="p-4 bg-indigo-50 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tampons total</label>
                  <input type="number" min={1} max={20} value={stampsTotal} onChange={e => setStampsTotal(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Récompense</label>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Points / scan</label>
                  <input type="number" min={1} value={pointsPerScan} onChange={e => setPointsPerScan(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Seuil récompense</label>
                  <input type="number" min={1} value={rewardThreshold} onChange={e => setRewardThreshold(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Récompense</label>
                  <input value={rewardMessage} onChange={e => setRewardMessage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
            </div>
          )}
          {template.pass_kind === 'event' && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-purple-50 rounded-xl">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom de l&apos;événement</label>
                <input value={eventName} onChange={e => setEventName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Couleur principale</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="h-9 w-16 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                <span className="text-sm text-gray-500 font-mono">{color}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="edit-repeatable" checked={repeatable} onChange={e => setRepeatable(e.target.checked)}
                className="rounded" />
              <label htmlFor="edit-repeatable" className="text-sm text-gray-700">Pass répétable</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valide à partir du <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expire le <span className="text-gray-400 font-normal">(optionnel)</span></label>
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
              <label htmlFor="edit-isDefault" className="text-sm text-gray-700 font-medium cursor-pointer">
                Utiliser comme template par défaut (auto-attribution au client)
              </label>
              <p className="text-xs text-gray-500 mt-0.5">Un seul template peut être le template par défaut.</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
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

    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return; }
    setSuccess('Pass émis avec succès !');
    setIssuedPassId(json.pass.id);
    if (json.saveUrl) setSaveUrl(json.saveUrl);
    onIssued(json.pass.id);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Émettre un pass</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
            {published.length === 0 ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Aucun template publié. Créez-en un d&apos;abord.
              </p>
            ) : (
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {published.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({KIND_LABELS[t.pass_kind] ?? t.pass_kind})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <input
              placeholder="Rechercher un client…" value={customerQ} onChange={e => setCustomerQ(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {customers.length === 0 ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">Aucun client trouvé.</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Plateforme</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPlatform('apple')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${platform === 'apple' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                Apple Wallet
              </button>
              <button type="button" disabled
                className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-100 text-gray-400 bg-gray-50 cursor-not-allowed"
                title="Google Wallet bientôt disponible">
                Google Wallet (bientôt)
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && (
            <div className="bg-emerald-50 rounded-xl px-4 py-3 space-y-3">
              <p className="text-sm font-medium text-emerald-700">{success}</p>
              {issuedPassId && platform === 'apple' && (
                <div className="space-y-1">
                  <p className="text-xs text-emerald-600">Ouvrez ce lien sur un iPhone pour installer le pass :</p>
                  <AddToAppleWalletButton passId={issuedPassId} />
                </div>
              )}
              {issuedPassId && platform === 'google' && saveUrl && (
                <div className="space-y-1">
                  <p className="text-xs text-emerald-600">Cliquez pour ajouter à Google Wallet :</p>
                  <a
                    href={saveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
                  >
                    <GoogleWalletIcon />
                    Ajouter à Google Wallet
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              Fermer
            </button>
            <button type="submit" disabled={issuing || !templateId || !customerId || published.length === 0}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
              {issuing ? 'Émission…' : 'Émettre le pass'}
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

function TemplatesTable({ templates, token, onIssue, onSetDefault, onEdit, onArchive }: TemplatesTableProps) {
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [archiving,      setArchiving]      = useState<string | null>(null);
  const [archiveErr,     setArchiveErr]     = useState<string | null>(null);

  const visible = templates.filter(t => t.status !== 'archived');

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

  async function handleArchive(t: Template) {
    if (!confirm(`Archiver "${t.name}" ? Cette action est irréversible depuis l'interface.`)) return;
    setArchiving(t.id);
    setArchiveErr(null);
    const res  = await fetch(`/api/wallet/templates/${t.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ status: 'archived' }),
    });
    const json = await res.json();
    setArchiving(null);
    if (!res.ok) { setArchiveErr(json.error ?? 'Erreur'); return; }
    onArchive(t.id);
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center">
        <p className="text-gray-400 text-sm">Aucun template pour l&apos;instant.</p>
        <p className="text-gray-400 text-xs mt-1">Cliquez sur « Nouveau template » pour commencer.</p>
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
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3 text-right">Passes actifs</th>
              <th className="px-4 py-3 text-left">Valide jusqu&apos;au</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.primary_color && (
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.primary_color }} />
                    )}
                    {t.name}
                    {t.is_default && (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Défaut</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3"><KindBadge kind={t.pass_kind} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={t.status} />
                    <span className="text-gray-600 capitalize">{t.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">{t.active_passes}</td>
                <td className="px-4 py-3 text-gray-500">
                  {t.valid_to ? new Date(t.valid_to).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {!t.is_default && t.status === 'published' && (
                      <button
                        onClick={() => handleSetDefault(t.id)}
                        disabled={settingDefault === t.id}
                        className="text-xs text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                      >
                        {settingDefault === t.id ? '…' : 'Définir par défaut'}
                      </button>
                    )}
                    <button
                      onClick={() => onEdit(t)}
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-full transition-colors"
                    >
                      Modifier
                    </button>
                    {t.active_passes === 0 && (
                      <button
                        onClick={() => handleArchive(t)}
                        disabled={archiving === t.id}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                      >
                        {archiving === t.id ? '…' : 'Archiver'}
                      </button>
                    )}
                    {t.status === 'published' && (
                      <button
                        onClick={() => onIssue(t.id)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-full transition-colors"
                      >
                        Émettre →
                      </button>
                    )}
                  </div>
                </td>
              </tr>
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
  const [customerQ,      setCustomerQ]      = useState('');
  const [selectedId,     setSelectedId]     = useState('');
  const [passes,         setPasses]         = useState<Pass[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [revoking,       setRevoking]       = useState<string | null>(null);
  const [syncing,        setSyncing]        = useState<string | null>(null);
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
    if (!confirm('Révoquer ce pass ? Le client ne pourra plus l\'utiliser.')) return;
    setRevoking(passId);
    setActionErr(null);
    const res  = await fetch(`/api/wallet/passes/${passId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action: 'revoke' }),
    });
    const json = await res.json();
    setRevoking(null);
    if (!res.ok) { setActionErr(json.error ?? 'Erreur'); return; }
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
    if (!res.ok) { setActionErr(json.error ?? 'Erreur'); return; }
    const now = new Date().toISOString();
    setPasses(prev => prev.map(p =>
      p.id === passId
        ? { ...p, last_synced_at: json.synced ? now : p.last_synced_at, sync_error: json.syncError }
        : p,
    ));
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Passes émis</h2>
      <p className="text-sm text-gray-500 mb-4">Consultez, révoquez ou synchronisez les passes d&apos;un client.</p>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {/* Customer search */}
        <div className="p-4 border-b border-gray-100">
          <input
            placeholder="Rechercher un client…"
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
            <p className="text-sm text-gray-400 text-center py-4">Sélectionnez un client pour voir ses passes.</p>
          )}

          {loading && (
            <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
          )}

          {actionErr && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{actionErr}</p>
          )}

          {!loading && selectedId && passes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucun pass pour ce client.</p>
          )}

          {!loading && passes.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Plateforme</th>
                    <th className="px-3 py-2 text-left">Template</th>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-left">Émis le</th>
                    <th className="px-3 py-2 text-left">Sync</th>
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
                        {p.issued_at ? new Date(p.issued_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {p.platform === 'google' ? (
                          p.last_synced_at
                            ? <span className="text-gray-500">{new Date(p.last_synced_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            : <span className="text-amber-600">Jamais</span>
                        ) : (
                          <span className="text-gray-400">En direct</span>
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
                              {revoking === p.id ? '…' : 'Révoquer'}
                            </button>
                          )}
                          {p.status === 'active' && p.platform === 'google' && p.object_id && (
                            <button
                              onClick={() => handleSync(p.id)}
                              disabled={syncing === p.id}
                              className="text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-2 py-1 rounded-full transition-colors"
                            >
                              {syncing === p.id ? '…' : 'Sync'}
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
    if (!res.ok) { setErr(json.error ?? 'Erreur'); return; }
    setPassId(json.passId);
  }

  if (passId) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-gray-500">Ouvrez ce lien sur un iPhone :</p>
        <AddToAppleWalletButton passId={passId} />
        <button
          onClick={() => setPassId(null)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Recommencer
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
        {loading ? 'Génération…' : '📱 Tester sur iPhone'}
      </button>
      {err && <p className="text-xs text-red-600 max-w-xs">{err}</p>}
    </div>
  );
}

/* ── Google Class Sync Button ─────────────────────────────────────────────── */

function GoogleClassSyncButton({ token }: { token: string }) {
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
    if (!res.ok) { setErr(json.error ?? 'Erreur'); return; }
    setResult({ synced: json.synced, failed: json.failed });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={runSync}
        disabled={syncing || !token}
        className="flex items-center gap-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {syncing ? 'Synchronisation…' : '🟢 Synchroniser les classes'}
      </button>
      {result && (
        <p className={`text-xs ${result.failed > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {result.synced} classe{result.synced !== 1 ? 's' : ''} synchronisée{result.synced !== 1 ? 's' : ''}
          {result.failed > 0 ? `, ${result.failed} échec${result.failed !== 1 ? 's' : ''}` : ''}
        </p>
      )}
      {err && <p className="text-xs text-red-600 max-w-xs">{err}</p>}
    </div>
  );
}

function RecoverPassesButton({ token }: { token: string }) {
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
    if (!res.ok) { setErr(json.error ?? 'Erreur'); return; }
    setResult({ recovered: json.recovered, failed: json.failed, skipped: json.skipped });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={runRecover}
        disabled={recovering || !token}
        className="flex items-center gap-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {recovering ? 'Récupération…' : '🔧 Récupérer les passes échoués'}
      </button>
      {result !== null && (
        <p className={`text-xs ${result.failed > 0 ? 'text-amber-600' : result.recovered === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>
          {result.recovered === 0 && result.failed === 0
            ? 'Aucun pass à récupérer'
            : `${result.recovered} récupéré${result.recovered !== 1 ? 's' : ''}${result.failed > 0 ? `, ${result.failed} échec${result.failed !== 1 ? 's' : ''}` : ''}`
          }
        </p>
      )}
      {err && <p className="text-xs text-red-600 max-w-xs">{err}</p>}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function WalletStudioPage() {
  const router = useRouter();
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
        <p className="text-gray-500 text-sm">Chargement du Wallet Studio…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white shadow p-8 max-w-sm w-full text-center">
          <p className="text-red-600 font-medium mb-2">Erreur</p>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-indigo-600 hover:underline">
            ← Retour au tableau de bord
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
            <h2 className="font-semibold text-gray-900 mb-1">Wallet Studio — Plan Pro requis</h2>
            <p className="text-sm text-gray-500">
              Les passes numériques Apple Wallet et Google Wallet sont réservés au plan Pro.
              Passez au plan Pro pour activer cette fonctionnalité.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-primary-600 hover:text-primary-800 underline transition-colors"
          >
            ← Retour au tableau de bord
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
          ← Tableau de bord
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Wallet Studio</h1>
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
            Propriétaire plateforme
          </span>
          {restaurantName && (
            <span className="text-xs text-gray-500">{restaurantName}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/wallet-preview')}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Éditeur de carte →
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ── Templates section ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Templates de passes</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {visibleTemplates.length === 0
                  ? 'Créez votre premier template pour commencer à émettre des passes.'
                  : `${visibleTemplates.length} template${visibleTemplates.length > 1 ? 's' : ''} · ${visibleTemplates.reduce((s, t) => s + t.active_passes, 0)} passes actifs au total`}
              </p>
            </div>
            <div className="flex gap-2">
              {visibleTemplates.some(t => t.status === 'published') && (
                <button
                  onClick={() => { setIssueTemplateId(undefined); setShowIssue(true); }}
                  className="flex items-center gap-1.5 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  📲 Émettre un pass
                </button>
              )}
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                + Nouveau template
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
                label: 'Templates actifs',
                value: visibleTemplates.filter(t => t.status === 'published').length,
                color: 'text-emerald-700 bg-emerald-50',
              },
              {
                label: 'Passes émis (actifs)',
                value: visibleTemplates.reduce((s, t) => s + t.active_passes, 0),
                color: 'text-indigo-700 bg-indigo-50',
              },
              {
                label: 'Clients enregistrés',
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
            Passes numériques
          </h2>
          <div className="space-y-3">
            {/* Apple Wallet */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🍎</span>
                  <h3 className="font-semibold text-gray-900 text-sm">Passes Apple Wallet (.pkpass)</h3>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Actif
                  </span>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                  Les passes sont générés et signés automatiquement. Utilisez le bouton de test
                  pour installer un pass sur votre iPhone et valider la configuration.
                </p>
              </div>
              <TestAppleWalletButton token={token} />
            </div>

            {/* Google Wallet */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row sm:items-start gap-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🟢</span>
                  <h3 className="font-semibold text-gray-900 text-sm">Google Wallet (REST API)</h3>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Actif
                  </span>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                  Les classes Google Wallet doivent être synchronisées avant d&apos;émettre des passes.
                  Utilisez « Récupérer les passes échoués » pour corriger les passes dont l&apos;installation échouait.
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
            Fonctionnalités à venir
          </h2>
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-5 flex gap-3">
            <span className="text-2xl shrink-0">📊</span>
            <div>
              <h3 className="font-semibold text-gray-700 text-sm mb-1">Analytics passes</h3>
              <p className="text-xs text-gray-500">Suivi d&apos;utilisation, taux d&apos;activation et statistiques par template.</p>
              <span className="inline-block mt-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Bientôt</span>
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
