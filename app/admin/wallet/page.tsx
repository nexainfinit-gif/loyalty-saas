'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/* ── Types ───────────────────────────────────────────────────────────────── */

type PassKind = 'stamps' | 'points' | 'event';
type PassStatus = 'published' | 'draft' | 'archived';

interface Restaurant {
  id:   string;
  name: string;
  slug: string;
}

interface WalletTemplate {
  id:            string;
  name:          string;
  pass_kind:     PassKind;
  status:        PassStatus;
  primary_color: string | null;
  config_json:   Record<string, unknown>;
  is_repeatable: boolean;
  is_default:    boolean;
  valid_from:    string | null;
  valid_to:      string | null;
  created_at:    string;
  restaurant_id: string;
  active_passes: number;
  restaurants:   { id: string; name: string; slug: string } | null;
}

/* ── Empty template form state ───────────────────────────────────────────── */

const EMPTY_FORM = {
  restaurant_id:  '',
  name:           '',
  pass_kind:      'stamps' as PassKind,
  status:         'published' as PassStatus,
  primary_color:  '#4f6bed',
  is_default:     false,
  is_repeatable:  false,
  valid_from:     '',
  valid_to:       '',
  // config_json fields
  stamp_count:    10,
  reward_text:    '',
  description:    '',
  logo_url:       '',
  apple_enabled:  true,
  google_enabled: true,
};

type FormState = typeof EMPTY_FORM;

/* ── Status badge ────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: PassStatus }) {
  const styles: Record<PassStatus, string> = {
    published: 'bg-emerald-50 text-emerald-700',
    draft:     'bg-amber-50 text-amber-700',
    archived:  'bg-gray-100 text-gray-500',
  };
  const labels: Record<PassStatus, string> = {
    published: 'Publié',
    draft:     'Brouillon',
    archived:  'Archivé',
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/* ── Kind badge ──────────────────────────────────────────────────────────── */

function KindBadge({ kind }: { kind: PassKind }) {
  const styles: Record<PassKind, string> = {
    stamps: 'bg-blue-50 text-blue-700',
    points: 'bg-violet-50 text-violet-700',
    event:  'bg-orange-50 text-orange-700',
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${styles[kind]}`}>
      {kind}
    </span>
  );
}

/* ── Form field helpers ──────────────────────────────────────────────────── */

function FormField({
  label, children, hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 transition-colors';
const selectCls = inputCls + ' bg-white';

/* ── Main page ───────────────────────────────────────────────────────────── */

export default function AdminWalletPage() {
  const router = useRouter();

  const [templates, setTemplates]   = useState<WalletTemplate[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filterRestaurant, setFilterRestaurant] = useState('');

  // Create / Edit modal
  const [showModal, setShowModal]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Issue test card
  const [issueTemplateId, setIssueTemplateId]       = useState<string | null>(null);
  const [issueRestaurantId, setIssueRestaurantId]   = useState('');
  const [issueInput, setIssueInput]                 = useState('');
  const [issuePlatform, setIssuePlatform]           = useState<'google' | 'apple'>('google');
  const [issuing, setIssuing]                       = useState(false);
  const [issueResult, setIssueResult]               = useState<{ ok: boolean; msg: string; saveUrl?: string } | null>(null);

  /* ── Fetch data ──────────────────────────────────────────────────────────── */

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filterRestaurant
        ? `/api/admin/wallet/templates?restaurantId=${filterRestaurant}`
        : '/api/admin/wallet/templates';
      const res = await fetch(url);
      if (res.status === 401 || res.status === 403) { router.replace('/dashboard'); return; }
      if (!res.ok) throw new Error('Erreur serveur');
      const json = await res.json();
      setTemplates(json.templates ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterRestaurant, router]);

  const fetchRestaurants = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/restaurants?filter=all&sort=name&order=asc');
      if (!res.ok) return;
      const json = await res.json();
      setRestaurants((json.restaurants ?? []).map((r: { id: string; name: string; slug: string }) => ({
        id: r.id, name: r.name, slug: r.slug,
      })));
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { fetchRestaurants(); }, [fetchRestaurants]);

  /* ── Modal helpers ───────────────────────────────────────────────────────── */

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setSaveError(null);
    setShowModal(true);
  }

  function openEdit(t: WalletTemplate) {
    setEditId(t.id);
    const cfg = (t.config_json ?? {}) as Record<string, unknown>;
    setForm({
      restaurant_id:  t.restaurant_id,
      name:           t.name,
      pass_kind:      t.pass_kind,
      status:         t.status,
      primary_color:  t.primary_color ?? '#4f6bed',
      is_default:     t.is_default,
      is_repeatable:  t.is_repeatable,
      valid_from:     t.valid_from ? t.valid_from.slice(0, 10) : '',
      valid_to:       t.valid_to   ? t.valid_to.slice(0, 10)   : '',
      stamp_count:    Number(cfg.stamp_count  ?? 10),
      reward_text:    String(cfg.reward_text  ?? ''),
      description:    String(cfg.description  ?? ''),
      logo_url:       String(cfg.logo_url     ?? ''),
      apple_enabled:  cfg.apple_enabled  !== false,
      google_enabled: cfg.google_enabled !== false,
    });
    setSaveError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /* ── Save template ───────────────────────────────────────────────────────── */

  async function handleSave() {
    if (!form.name.trim())       { setSaveError('Le nom est requis.'); return; }
    if (!form.restaurant_id)     { setSaveError('Sélectionnez un restaurant.'); return; }

    setSaving(true);
    setSaveError(null);

    const config_json = {
      stamp_count:    form.stamp_count,
      reward_text:    form.reward_text,
      description:    form.description,
      logo_url:       form.logo_url,
      apple_enabled:  form.apple_enabled,
      google_enabled: form.google_enabled,
    };

    const payload = {
      restaurant_id:  form.restaurant_id,
      name:           form.name.trim(),
      pass_kind:      form.pass_kind,
      status:         form.status,
      primary_color:  form.primary_color || null,
      is_default:     form.is_default,
      is_repeatable:  form.is_repeatable,
      valid_from:     form.valid_from || null,
      valid_to:       form.valid_to   || null,
      config_json,
    };

    try {
      const res = editId
        ? await fetch(`/api/admin/wallet/templates/${editId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/wallet/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const json = await res.json();
      if (!res.ok) { setSaveError(json.error ?? 'Erreur serveur.'); return; }

      closeModal();
      fetchTemplates();
    } catch {
      setSaveError('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  /* ── Delete template ─────────────────────────────────────────────────────── */

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce template ? Cette action est irréversible.')) return;
    setDeletingId(id);
    try {
      const res  = await fetch(`/api/admin/wallet/templates/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? 'Erreur lors de la suppression.'); return; }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success('Template supprimé');
    } catch {
      toast.error('Erreur réseau.');
    } finally {
      setDeletingId(null);
    }
  }

  /* ── Quick status toggle ─────────────────────────────────────────────────── */

  async function toggleStatus(t: WalletTemplate) {
    const next = t.status === 'published' ? 'archived' : 'published';
    const res = await fetch(`/api/admin/wallet/templates/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x));
    }
  }

  /* ── Issue test card ─────────────────────────────────────────────────────── */

  function openIssue(t: WalletTemplate) {
    setIssueTemplateId(t.id);
    setIssueRestaurantId(t.restaurant_id);
    setIssueInput('');
    setIssuePlatform('google');
    setIssueResult(null);
  }

  function closeIssue() {
    setIssueTemplateId(null);
    setIssueResult(null);
  }

  async function handleIssue() {
    if (!issueInput.trim()) return;
    setIssuing(true);
    setIssueResult(null);

    const isEmail = issueInput.includes('@');
    const body: Record<string, string> = {
      restaurantId: issueRestaurantId,
      templateId:   issueTemplateId!,
      platform:     issuePlatform,
      ...(isEmail ? { email: issueInput.trim() } : { customerId: issueInput.trim() }),
    };

    try {
      const res  = await fetch('/api/admin/wallet/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setIssueResult({ ok: false, msg: json.error ?? 'Erreur serveur.' });
      } else {
        setIssueResult({ ok: true, msg: '✓ Pass émis avec succès.', saveUrl: json.saveUrl });
      }
    } catch {
      setIssueResult({ ok: false, msg: 'Erreur réseau.' });
    } finally {
      setIssuing(false);
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────────── */

  const issuedTemplate = templates.find((t) => t.id === issueTemplateId);

  return (
    <div className="min-h-screen bg-surface">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Admin
            </button>
            <span className="text-gray-200">/</span>
            <h1 className="text-lg font-bold text-gray-900">Wallet Studio</h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin/plans" className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors">Plans</a>
            <a href="/admin/kpis"  className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors">KPIs</a>
            <a href="/dashboard"   className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterRestaurant}
            onChange={(e) => setFilterRestaurant(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
          >
            <option value="">Tous les restaurants</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          <button
            onClick={fetchTemplates}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            Actualiser
          </button>

          <button
            onClick={openCreate}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            + Nouveau template
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12 text-center">
            <div className="inline-block w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400 mt-3">Chargement…</p>
          </div>
        )}

        {/* Templates table */}
        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            {templates.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-gray-400">Aucun template — créez le premier ci-dessus.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Template</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Restaurant</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Statut</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Pass actifs</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Défaut</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Plateformes</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {templates.map((t) => {
                      const cfg = (t.config_json ?? {}) as Record<string, unknown>;
                      const appleEnabled  = cfg.apple_enabled  !== false;
                      const googleEnabled = cfg.google_enabled !== false;
                      return (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {t.primary_color && (
                                <div
                                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white shadow-sm"
                                  style={{ backgroundColor: t.primary_color }}
                                />
                              )}
                              <div>
                                <p className="font-semibold text-gray-900">{t.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{t.id.slice(0, 8)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-gray-700">{t.restaurants?.name ?? '—'}</p>
                            <p className="text-xs text-gray-400">{t.restaurants?.slug ?? ''}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <KindBadge kind={t.pass_kind} />
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="px-4 py-3.5 tabular-nums text-gray-700">
                            {t.active_passes}
                          </td>
                          <td className="px-4 py-3.5">
                            {t.is_default ? (
                              <span className="text-xs font-semibold text-primary-600">✓ Défaut</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {appleEnabled && (
                                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600">
                                  Apple
                                </span>
                              )}
                              {googleEnabled && (
                                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-600">
                                  Google
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => openIssue(t)}
                                className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors whitespace-nowrap"
                              >
                                Émettre
                              </button>
                              <button
                                onClick={() => openEdit(t)}
                                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                              >
                                Éditer
                              </button>
                              <button
                                onClick={() => toggleStatus(t)}
                                className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
                              >
                                {t.status === 'published' ? 'Archiver' : 'Publier'}
                              </button>
                              <button
                                onClick={() => handleDelete(t.id)}
                                disabled={deletingId === t.id}
                                className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                {deletingId === t.id ? '…' : 'Supprimer'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Info row */}
        <p className="text-xs text-gray-400 text-center">
          {templates.length} template{templates.length !== 1 ? 's' : ''} · Accès réservé aux propriétaires de la plateforme
        </p>

      </main>

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                {editId ? 'Modifier le template' : 'Nouveau template'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Restaurant */}
              <FormField label="Restaurant *">
                <select
                  value={form.restaurant_id}
                  onChange={(e) => setField('restaurant_id', e.target.value)}
                  className={selectCls}
                  disabled={!!editId}
                >
                  <option value="">Sélectionner un restaurant…</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
                  ))}
                </select>
                {editId && <p className="text-xs text-gray-400 mt-1">Le restaurant ne peut pas être modifié après création.</p>}
              </FormField>

              {/* Name */}
              <FormField label="Nom du template *">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="ex. Carte fidélité Stamps"
                  className={inputCls}
                />
              </FormField>

              {/* Kind + Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Type de pass">
                  <select
                    value={form.pass_kind}
                    onChange={(e) => setField('pass_kind', e.target.value as PassKind)}
                    className={selectCls}
                  >
                    <option value="stamps">Stamps (tampon)</option>
                    <option value="points">Points</option>
                    <option value="event">Événement</option>
                  </select>
                </FormField>
                <FormField label="Statut">
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value as PassStatus)}
                    className={selectCls}
                  >
                    <option value="published">Publié</option>
                    <option value="draft">Brouillon</option>
                    <option value="archived">Archivé</option>
                  </select>
                </FormField>
              </div>

              {/* Color + Stamp count */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Couleur principale" hint="Hex — ex. #4f6bed">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.primary_color}
                      onChange={(e) => setField('primary_color', e.target.value)}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                    />
                    <input
                      type="text"
                      value={form.primary_color}
                      onChange={(e) => setField('primary_color', e.target.value)}
                      className={inputCls + ' flex-1'}
                      placeholder="#4f6bed"
                    />
                  </div>
                </FormField>
                <FormField label="Nombre de tampons (stamps)" hint="Nombre total de cases sur la carte">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={form.stamp_count}
                    onChange={(e) => setField('stamp_count', Number(e.target.value))}
                    className={inputCls}
                  />
                </FormField>
              </div>

              {/* Reward text */}
              <FormField label="Message de récompense" hint="Affiché sur le pass quand la carte est complète">
                <input
                  type="text"
                  value={form.reward_text}
                  onChange={(e) => setField('reward_text', e.target.value)}
                  placeholder="ex. Café offert !"
                  className={inputCls}
                />
              </FormField>

              {/* Description */}
              <FormField label="Description" hint="Texte affiché au verso du pass">
                <textarea
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={2}
                  placeholder="ex. Valable dans tous nos établissements."
                  className={inputCls + ' resize-none'}
                />
              </FormField>

              {/* Logo URL */}
              <FormField label="Logo URL" hint="URL publique du logo pour le pass (optionnel — utilise le logo du restaurant par défaut)">
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={(e) => setField('logo_url', e.target.value)}
                  placeholder="https://…"
                  className={inputCls}
                />
              </FormField>

              {/* Validity */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Valide à partir de" hint="Laisser vide = immédiatement">
                  <input
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setField('valid_from', e.target.value)}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Valide jusqu'au" hint="Laisser vide = pas d'expiration">
                  <input
                    type="date"
                    value={form.valid_to}
                    onChange={(e) => setField('valid_to', e.target.value)}
                    className={inputCls}
                  />
                </FormField>
              </div>

              {/* Platforms */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Plateformes acceptées">
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.apple_enabled}
                        onChange={(e) => setField('apple_enabled', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">Apple Wallet</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.google_enabled}
                        onChange={(e) => setField('google_enabled', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">Google Wallet</span>
                    </label>
                  </div>
                </FormField>
                <FormField label="Options">
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_default}
                        onChange={(e) => setField('is_default', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">Template par défaut</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_repeatable}
                        onChange={(e) => setField('is_repeatable', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">Répétable (multi-pass)</span>
                    </label>
                  </div>
                </FormField>
              </div>

              {/* Error */}
              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{saveError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Sauvegarde…' : editId ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Issue test card panel ────────────────────────────────────────────── */}
      {issueTemplateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Émettre un pass test</h2>
                {issuedTemplate && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Template : <span className="font-medium text-gray-600">{issuedTemplate.name}</span>
                  </p>
                )}
              </div>
              <button onClick={closeIssue} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <FormField
                label="Email ou ID client"
                hint="Entrez l'email ou l'UUID du client pour ce restaurant"
              >
                <input
                  type="text"
                  value={issueInput}
                  onChange={(e) => setIssueInput(e.target.value)}
                  placeholder="client@email.com ou uuid"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Plateforme">
                <div className="flex gap-3">
                  {(['google', 'apple'] as const).map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="platform"
                        value={p}
                        checked={issuePlatform === p}
                        onChange={() => setIssuePlatform(p)}
                        className="text-primary-600"
                      />
                      <span className="text-sm text-gray-700 capitalize">{p} Wallet</span>
                    </label>
                  ))}
                </div>
              </FormField>

              {issueResult && (
                <div className={`rounded-xl px-4 py-3 text-sm ${issueResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  <p>{issueResult.msg}</p>
                  {issueResult.saveUrl && (
                    <a
                      href={issueResult.saveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"
                    >
                      Ouvrir le lien Google Wallet →
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={closeIssue}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Fermer
              </button>
              <button
                onClick={handleIssue}
                disabled={issuing || !issueInput.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {issuing ? 'Émission…' : 'Émettre'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
