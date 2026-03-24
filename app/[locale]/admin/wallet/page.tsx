'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';
import LocaleLink from '@/components/LocaleLink';
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

function StatusBadge({ status, label }: { status: PassStatus; label: string }) {
  const styles: Record<PassStatus, string> = {
    published: 'bg-emerald-50 text-emerald-700',
    draft:     'bg-amber-50 text-amber-700',
    archived:  'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {label}
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
  const router = useLocaleRouter();
  const { t } = useTranslation();

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
      if (!res.ok) throw new Error(t('admin.walletServerError'));
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
    if (!form.name.trim())       { setSaveError(t('admin.walletNameRequired')); return; }
    if (!form.restaurant_id)     { setSaveError(t('admin.walletRestaurantRequired')); return; }

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
      if (!res.ok) { setSaveError(json.error ?? t('admin.walletServerError')); return; }

      closeModal();
      fetchTemplates();
    } catch {
      setSaveError(t('admin.walletNetworkError'));
    } finally {
      setSaving(false);
    }
  }

  /* ── Delete template ─────────────────────────────────────────────────────── */

  async function handleDelete(id: string) {
    if (!confirm(t('admin.walletDeleteConfirm'))) return;
    setDeletingId(id);
    try {
      const res  = await fetch(`/api/admin/wallet/templates/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? t('admin.walletDeleteError')); return; }
      setTemplates((prev) => prev.filter((tmpl) => tmpl.id !== id));
      toast.success(t('admin.walletDeleteSuccess'));
    } catch {
      toast.error(t('admin.walletNetworkError'));
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
        setIssueResult({ ok: false, msg: json.error ?? t('admin.walletServerError') });
      } else {
        setIssueResult({ ok: true, msg: t('admin.walletIssueSuccess'), saveUrl: json.saveUrl });
      }
    } catch {
      setIssueResult({ ok: false, msg: t('admin.walletNetworkError') });
    } finally {
      setIssuing(false);
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────────── */

  const issuedTemplate = templates.find((tmpl) => tmpl.id === issueTemplateId);

  const statusLabels: Record<PassStatus, string> = {
    published: t('admin.walletStatusPublished'),
    draft:     t('admin.walletStatusDraft'),
    archived:  t('admin.walletStatusArchived'),
  };

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
              {t('admin.walletBack')}
            </button>
            <span className="text-gray-200">/</span>
            <h1 className="text-lg font-bold text-gray-900">{t('admin.walletTitle')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <LocaleLink href="/admin/plans" className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors">{t('admin.plans')}</LocaleLink>
            <LocaleLink href="/admin/kpis"  className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors">{t('admin.kpis')}</LocaleLink>
            <LocaleLink href="/dashboard"   className="text-sm text-gray-500 hover:text-gray-700 transition-colors">{t('admin.backToDashboard')}</LocaleLink>
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
            <option value="">{t('admin.walletAllRestaurants')}</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          <button
            onClick={fetchTemplates}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            {t('admin.walletRefresh')}
          </button>

          <button
            onClick={openCreate}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            {t('admin.walletNewTemplate')}
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
            <p className="text-sm text-gray-400 mt-3">{t('common.loading')}</p>
          </div>
        )}

        {/* Templates table */}
        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            {templates.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-gray-400">{t('admin.walletNoTemplates')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.walletHeaderTemplate')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.walletHeaderRestaurant')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.walletHeaderType')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.walletHeaderStatus')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.walletHeaderActivePasses')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.walletHeaderDefault')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.walletHeaderPlatforms')}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {templates.map((tmpl) => {
                      const cfg = (tmpl.config_json ?? {}) as Record<string, unknown>;
                      const appleEnabled  = cfg.apple_enabled  !== false;
                      const googleEnabled = cfg.google_enabled !== false;
                      return (
                        <tr key={tmpl.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {tmpl.primary_color && (
                                <div
                                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white shadow-sm"
                                  style={{ backgroundColor: tmpl.primary_color }}
                                />
                              )}
                              <div>
                                <p className="font-semibold text-gray-900">{tmpl.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{tmpl.id.slice(0, 8)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-gray-700">{tmpl.restaurants?.name ?? '—'}</p>
                            <p className="text-xs text-gray-400">{tmpl.restaurants?.slug ?? ''}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <KindBadge kind={tmpl.pass_kind} />
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={tmpl.status} label={statusLabels[tmpl.status]} />
                          </td>
                          <td className="px-4 py-3.5 tabular-nums text-gray-700">
                            {tmpl.active_passes}
                          </td>
                          <td className="px-4 py-3.5">
                            {tmpl.is_default ? (
                              <span className="text-xs font-semibold text-primary-600">{t('admin.walletDefaultYes')}</span>
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
                                onClick={() => openIssue(tmpl)}
                                className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors whitespace-nowrap"
                              >
                                {t('admin.walletIssue')}
                              </button>
                              <button
                                onClick={() => router.push(`/admin/wallet-preview?templateId=${tmpl.id}`)}
                                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                              >
                                {t('admin.walletEdit')}
                              </button>
                              <button
                                onClick={() => toggleStatus(tmpl)}
                                className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
                              >
                                {tmpl.status === 'published' ? t('admin.walletArchive') : t('admin.walletPublish')}
                              </button>
                              <button
                                onClick={() => handleDelete(tmpl.id)}
                                disabled={deletingId === tmpl.id}
                                className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                {deletingId === tmpl.id ? '…' : t('admin.walletDelete')}
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
          {t('admin.walletFooter', { count: templates.length })}
        </p>

      </main>

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                {editId ? t('admin.walletEditTitle') : t('admin.walletCreateTitle')}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Restaurant */}
              <FormField label={t('admin.walletRestaurantLabel')}>
                <select
                  value={form.restaurant_id}
                  onChange={(e) => setField('restaurant_id', e.target.value)}
                  className={selectCls}
                  disabled={!!editId}
                >
                  <option value="">{t('admin.walletSelectRestaurant')}</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
                  ))}
                </select>
                {editId && <p className="text-xs text-gray-400 mt-1">{t('admin.walletRestaurantReadonly')}</p>}
              </FormField>

              {/* Name */}
              <FormField label={t('admin.walletNameLabel')}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={t('admin.walletNamePlaceholder')}
                  className={inputCls}
                />
              </FormField>

              {/* Kind + Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label={t('admin.walletPassKindLabel')}>
                  <select
                    value={form.pass_kind}
                    onChange={(e) => setField('pass_kind', e.target.value as PassKind)}
                    className={selectCls}
                  >
                    <option value="stamps">{t('admin.walletPassKindStamps')}</option>
                    <option value="points">{t('admin.walletPassKindPoints')}</option>
                    <option value="event">{t('admin.walletPassKindEvent')}</option>
                  </select>
                </FormField>
                <FormField label={t('admin.walletStatusLabel')}>
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value as PassStatus)}
                    className={selectCls}
                  >
                    <option value="published">{t('admin.walletStatusPublished')}</option>
                    <option value="draft">{t('admin.walletStatusDraft')}</option>
                    <option value="archived">{t('admin.walletStatusArchived')}</option>
                  </select>
                </FormField>
              </div>

              {/* Color + Stamp count */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label={t('admin.walletColorLabel')} hint={t('admin.walletColorHint')}>
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
                <FormField label={t('admin.walletStampCountLabel')} hint={t('admin.walletStampCountHint')}>
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
              <FormField label={t('admin.walletRewardLabel')} hint={t('admin.walletRewardHint')}>
                <input
                  type="text"
                  value={form.reward_text}
                  onChange={(e) => setField('reward_text', e.target.value)}
                  placeholder={t('admin.walletRewardPlaceholder')}
                  className={inputCls}
                />
              </FormField>

              {/* Description */}
              <FormField label={t('admin.walletDescLabel')} hint={t('admin.walletDescHint')}>
                <textarea
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={2}
                  placeholder={t('admin.walletDescPlaceholder')}
                  className={inputCls + ' resize-none'}
                />
              </FormField>

              {/* Logo URL */}
              <FormField label={t('admin.walletLogoLabel')} hint={t('admin.walletLogoHint')}>
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
                <FormField label={t('admin.walletValidFromLabel')} hint={t('admin.walletValidFromHint')}>
                  <input
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setField('valid_from', e.target.value)}
                    className={inputCls}
                  />
                </FormField>
                <FormField label={t('admin.walletValidToLabel')} hint={t('admin.walletValidToHint')}>
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
                <FormField label={t('admin.walletPlatformsLabel')}>
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.apple_enabled}
                        onChange={(e) => setField('apple_enabled', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">{t('admin.walletAppleWallet')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.google_enabled}
                        onChange={(e) => setField('google_enabled', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">{t('admin.walletGoogleWallet')}</span>
                    </label>
                  </div>
                </FormField>
                <FormField label={t('admin.walletOptionsLabel')}>
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_default}
                        onChange={(e) => setField('is_default', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">{t('admin.walletDefaultTemplate')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_repeatable}
                        onChange={(e) => setField('is_repeatable', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">{t('admin.walletRepeatable')}</span>
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
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('common.savingDots') : editId ? t('admin.walletSaveBtn') : t('admin.walletCreateBtn')}
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
                <h2 className="text-base font-bold text-gray-900">{t('admin.walletIssueTitle')}</h2>
                {issuedTemplate && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('admin.walletIssueTemplate')} <span className="font-medium text-gray-600">{issuedTemplate.name}</span>
                  </p>
                )}
              </div>
              <button onClick={closeIssue} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <FormField
                label={t('admin.walletIssueEmailLabel')}
                hint={t('admin.walletIssueEmailHint')}
              >
                <input
                  type="text"
                  value={issueInput}
                  onChange={(e) => setIssueInput(e.target.value)}
                  placeholder={t('admin.walletIssueEmailPlaceholder')}
                  className={inputCls}
                />
              </FormField>

              <FormField label={t('admin.walletIssuePlatformLabel')}>
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
                      {t('admin.walletIssueGoogleLink')}
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
                {t('common.close')}
              </button>
              <button
                onClick={handleIssue}
                disabled={issuing || !issueInput.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {issuing ? t('admin.walletIssuing') : t('admin.walletIssueBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
