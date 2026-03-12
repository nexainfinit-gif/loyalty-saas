'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';

/* ── Types ──────────────────────────────────────────────────────────────────── */

type KpiCategory = 'growth' | 'retention' | 'revenue' | 'engagement';

interface KpiRow {
  id:          string;
  key:         string;
  name:        string;
  description: string;
  category:    KpiCategory;
  is_active:   boolean;
  plan_access: Record<string, boolean>; // plan_id → enabled
}

interface PlanRef {
  id:   string;
  key:  string;
  name: string;
}

/* ── Category badge ─────────────────────────────────────────────────────────── */

const CATEGORY_STYLES: Record<KpiCategory, string> = {
  growth:      'bg-emerald-50 text-emerald-700',
  retention:   'bg-blue-50 text-blue-700',
  revenue:     'bg-violet-50 text-violet-700',
  engagement:  'bg-amber-50 text-amber-700',
};

function CategoryBadge({ category, label }: { category: KpiCategory; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${CATEGORY_STYLES[category] ?? 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  );
}

/* ── Create KPI modal ───────────────────────────────────────────────────────── */

function CreateKpiModal({
  onClose,
  onCreated,
  t,
}: {
  onClose: () => void;
  onCreated: (kpi: KpiRow) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [form, setForm] = useState({
    key: '', name: '', description: '', category: 'growth' as KpiCategory,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.key.trim() || !form.name.trim()) { setError(t('admin.kpisKeyRequired')); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? t('admin.kpisCreateError')); return; }
      onCreated({ ...json.kpi, plan_access: {} });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">{t('admin.kpisCreateTitle')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.kpisKeyLabel')}</label>
            <input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder={t('admin.kpisKeyPlaceholder')}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.kpisNameLabel')}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('admin.kpisNamePlaceholder')}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.kpisDescLabel')}</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('admin.kpisDescPlaceholder')}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.kpisCategoryLabel')}</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as KpiCategory })}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20 bg-white"
            >
              <option value="growth">{t('admin.kpisCatGrowth')}</option>
              <option value="retention">{t('admin.kpisCatRetention')}</option>
              <option value="revenue">{t('admin.kpisCatRevenue')}</option>
              <option value="engagement">{t('admin.kpisCatEngagement')}</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? t('admin.kpisCreating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Plan access cell ───────────────────────────────────────────────────────── */

function PlanAccessCell({
  kpiId,
  planId,
  enabled,
  onChange,
}: {
  kpiId: string;
  planId: string;
  enabled: boolean;
  onChange: (kpiId: string, planId: string, val: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    // Optimistically update then persist in background
    onChange(kpiId, planId, !enabled);
    setSaving(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className={[
        'relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50',
        enabled ? 'bg-primary-600' : 'bg-gray-200',
      ].join(' ')}
      title={enabled ? 'Off' : 'On'}
    >
      <span className={[
        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
        enabled ? 'translate-x-4' : 'translate-x-0',
      ].join(' ')} />
    </button>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminKpisPage() {
  const router = useLocaleRouter();
  const { t } = useTranslation();

  const [kpis, setKpis]         = useState<KpiRow[]>([]);
  const [plans, setPlans]       = useState<PlanRef[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/kpis');
      if (res.status === 401 || res.status === 403) { router.replace('/dashboard'); return; }
      if (!res.ok) throw new Error(t('admin.walletServerError'));
      const json = await res.json();
      setKpis(json.kpis ?? []);
      setPlans(json.plans ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Optimistic toggle — batch save on "Enregistrer"
  function handlePlanToggle(kpiId: string, planId: string, val: boolean) {
    setKpis((prev) => prev.map((k) =>
      k.id === kpiId ? { ...k, plan_access: { ...k.plan_access, [planId]: val } } : k
    ));
    setSaveMsg('');
  }

  async function toggleActive(kpi: KpiRow) {
    const res = await fetch(`/api/admin/kpis/${kpi.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !kpi.is_active }),
    });
    if (res.ok) {
      setKpis((prev) => prev.map((k) => k.id === kpi.id ? { ...k, is_active: !kpi.is_active } : k));
    }
  }

  async function saveAllPlanAccess() {
    setSaving(true);
    setSaveMsg('');
    try {
      // Fire one PUT per KPI (changed plan_access)
      await Promise.all(kpis.map((kpi) =>
        fetch(`/api/admin/kpis/${kpi.id}/plans`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kpi.plan_access),
        })
      ));
      setSaveMsg(t('admin.kpisAccessSaved'));
    } catch {
      setSaveMsg(t('admin.kpisSaveError'));
    } finally {
      setSaving(false);
    }
  }

  // Group by category
  const categories: KpiCategory[] = ['growth', 'retention', 'revenue', 'engagement'];
  const categoryLabels: Record<KpiCategory, string> = {
    growth:     t('admin.kpisCatGrowth'),
    retention:  t('admin.kpisCatRetention'),
    revenue:    t('admin.kpisCatRevenue'),
    engagement: t('admin.kpisCatEngagement'),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 mt-4">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              {t('admin.kpisBack')}
            </button>
            <span className="text-gray-200">/</span>
            <h1 className="text-lg font-bold text-gray-900">{t('admin.kpisTitle')}</h1>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className={`text-xs font-medium ${saveMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={saveAllPlanAccess}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {saving ? t('common.savingDots') : t('admin.kpisSaveAccess')}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              {t('admin.kpisCreate')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 rounded-xl border border-red-100 text-sm text-red-600">{error}</div>
        )}

        {/* Plan access legend */}
        {plans.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="font-medium">{t('admin.kpisAccessByPlan')}</span>
            {plans.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary-600 opacity-70" />
                {p.name}
              </span>
            ))}
          </div>
        )}

        {/* KPI table grouped by category */}
        {categories.map((cat) => {
          const catKpis = kpis.filter((k) => k.category === cat);
          if (catKpis.length === 0) return null;
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <CategoryBadge category={cat} label={categoryLabels[cat]} />
                <span className="text-xs text-gray-400">{catKpis.length} KPI{catKpis.length > 1 ? 's' : ''}</span>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.kpisHeaderKpi')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">{t('admin.kpisHeaderDesc')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{t('admin.kpisHeaderActive')}</th>
                      {plans.map((p) => (
                        <th key={p.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {catKpis.map((kpi) => (
                      <tr key={kpi.id} className={`hover:bg-gray-50/50 transition-colors ${!kpi.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{kpi.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{kpi.key}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs hidden md:table-cell">
                          {kpi.description || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleActive(kpi)}
                            className={[
                              'text-xs font-medium px-2 py-0.5 rounded-lg transition-colors',
                              kpi.is_active
                                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                : 'text-gray-400 bg-gray-100 hover:bg-gray-200',
                            ].join(' ')}
                          >
                            {kpi.is_active ? t('common.active') : t('common.inactive')}
                          </button>
                        </td>
                        {plans.map((p) => (
                          <td key={p.id} className="px-4 py-3 text-center">
                            <div className="flex justify-center">
                              <PlanAccessCell
                                kpiId={kpi.id}
                                planId={p.id}
                                enabled={kpi.plan_access[p.id] ?? false}
                                onChange={handlePlanToggle}
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {kpis.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
            {t('admin.kpisNone')}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateKpiModal
          t={t}
          onClose={() => setShowCreate(false)}
          onCreated={(kpi) => {
            setKpis((prev) => [...prev, kpi]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
