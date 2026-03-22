'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface GrowthAction {
  id:            string;
  restaurant_id: string;
  trigger_key:   string;
  action_type:   string;
  payload:       {
    type:           string;
    severity:       string;
    title:          string;
    message:        string;
    suggested_plan?: string | null;
  };
  status:        string;
  created_at:    string;
  executed_at:   string | null;
  restaurants:   { name: string } | null;
}

interface RestaurantRow {
  id:               string;
  name:             string;
  slug:             string;
  plan:             string;
  plan_name:        string;
  created_at:       string;
  health_score:     number;
  upgrade_score:    number;
  churn_risk_score: number;
  reasons:          string[];
  snapshot_at:      string | null;
  scans_yesterday:  number;
  unique_scanned:   number;
  registrations:    number;
  active_30d:       number;
  total_customers:  number;
  wallet_issued:    number;
}

type FilterKey = 'all' | 'upgrade' | 'churn' | 'free';
type SortKey   = 'health' | 'upgrade' | 'churn' | 'customers' | 'scans' | 'name';

/* ── Score badge ────────────────────────────────────────────────────────────── */

function ScoreBadge({ value, type }: { value: number; type: 'health' | 'upgrade' | 'churn' }) {
  let bg = 'bg-gray-100 text-gray-500';
  if (type === 'health') {
    if (value >= 70) bg = 'bg-emerald-50 text-emerald-700';
    else if (value >= 40) bg = 'bg-amber-50 text-amber-700';
    else bg = 'bg-red-50 text-red-600';
  } else if (type === 'upgrade') {
    if (value >= 70) bg = 'bg-blue-50 text-blue-700';
    else if (value >= 40) bg = 'bg-blue-50 text-blue-500';
  } else if (type === 'churn') {
    if (value >= 70) bg = 'bg-red-50 text-red-700';
    else if (value >= 40) bg = 'bg-amber-50 text-amber-700';
    else bg = 'bg-gray-100 text-gray-500';
  }
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${bg}`}>
      {value}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    starter: 'bg-gray-100 text-gray-500',
    basic: 'bg-blue-50 text-blue-600',
    pro:   'bg-violet-50 text-violet-600',
    enterprise: 'bg-amber-50 text-amber-700',
  };
  const cls = styles[plan] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {plan}
    </span>
  );
}

/* ── Sort header button ─────────────────────────────────────────────────────── */

function SortTh({
  label, field, currentSort, currentOrder,
  onSort,
}: {
  label: string;
  field: SortKey;
  currentSort: SortKey;
  currentOrder: 'asc' | 'desc';
  onSort: (f: SortKey) => void;
}) {
  const active = currentSort === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          <span className="text-primary-600">{currentOrder === 'desc' ? '↓' : '↑'}</span>
        ) : (
          <span className="text-gray-300">↕</span>
        )}
      </span>
    </th>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const router = useLocaleRouter();
  const { t, locale } = useTranslation();

  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [date, setDate]               = useState<string>('');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [sort, setSort]               = useState<SortKey>('health');
  const [order, setOrder]             = useState<'asc' | 'desc'>('desc');
  const [growthSummary, setGrowthSummary] = useState<{
    churn_risk_count:    number;
    upgrade_ready_count: number;
    free_count:          number;
    kpiLastComputedAt:   string | null;
    kpiFreshness:        'fresh' | 'stale' | 'missing';
  } | null>(null);
  const [recomputing, setRecomputing]     = useState(false);
  const [recomputeMsg, setRecomputeMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingActions, setPendingActions] = useState<GrowthAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [dismissingId, setDismissingId]   = useState<string | null>(null);
  const [seeding, setSeeding]             = useState(false);

  async function handleSeedDemo() {
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/seed-demo', { method: 'POST' });
      if (res.ok) {
        fetchData();
      }
    } catch {}
    setSeeding(false);
  }

  async function handleImpersonate(restaurantId: string) {
    await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId }),
    });
    window.location.href = `/${locale}/dashboard`;
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter, sort, order });
      const res = await fetch(`/api/admin/restaurants?${params}`);
      if (res.status === 401 || res.status === 403) {
        router.replace('/dashboard');
        return;
      }
      if (!res.ok) throw new Error(t('api.serverError'));
      const json = await res.json();
      setRestaurants(json.restaurants ?? []);
      setDate(json.date ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, sort, order, router, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch('/api/admin/growth/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) {
          setGrowthSummary({
            churn_risk_count:    json.churn_risk_count    ?? 0,
            upgrade_ready_count: json.upgrade_ready_count ?? 0,
            free_count:          json.free_count          ?? 0,
            kpiLastComputedAt:   json.kpiLastComputedAt   ?? null,
            kpiFreshness:        json.kpiFreshness        ?? 'missing',
          });
        }
      })
      .catch(() => {/* silently ignore — summary is non-critical */});
  }, []);

  // Fetch platform-wide pending growth actions
  const fetchActions = useCallback(async () => {
    setActionsLoading(true);
    try {
      const res = await fetch('/api/admin/growth/actions?limit=100');
      if (res.ok) {
        const json = await res.json();
        setPendingActions(json.actions ?? []);
      }
    } catch {/* non-critical */} finally {
      setActionsLoading(false);
    }
  }, []);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  async function handleDismissAction(actionId: string) {
    setDismissingId(actionId);
    try {
      const res = await fetch(`/api/admin/growth/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (res.ok) {
        setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
      }
    } catch {/* ignore */} finally {
      setDismissingId(null);
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeMsg(null);
    try {
      const res  = await fetch('/api/admin/metrics/recompute', { method: 'POST' });
      const json = await res.json();
      if (res.status === 429) {
        setRecomputeMsg({ text: t('admin.recomputeTooRecent', { seconds: String(json.retry_after_seconds) }), ok: false });
        return;
      }
      if (!res.ok) {
        setRecomputeMsg({ text: json.error ?? t('common.error'), ok: false });
        return;
      }
      setRecomputeMsg({
        text: t('admin.recomputeSuccess', { count: String(json.restaurantsProcessed), ms: String(json.durationMs) }),
        ok: true,
      });
      // Refresh freshness indicator
      setGrowthSummary((prev) => prev
        ? { ...prev, kpiLastComputedAt: json.computedAt, kpiFreshness: 'fresh' }
        : prev,
      );
    } catch {
      setRecomputeMsg({ text: t('common.networkError'), ok: false });
    } finally {
      setRecomputing(false);
      // Auto-clear toast after 6s
      setTimeout(() => setRecomputeMsg(null), 6000);
    }
  }

  function handleSort(field: SortKey) {
    if (sort === field) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(field);
      setOrder('desc');
    }
  }

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all',     label: t('admin.filterAll') },
    { key: 'upgrade', label: t('admin.filterUpgrade') },
    { key: 'churn',   label: t('admin.filterChurn') },
    { key: 'free',    label: t('admin.filterFree') },
  ];

  const totalScans = restaurants.reduce((s, r) => s + r.scans_yesterday, 0);
  const churnHighCount = restaurants.filter((r) => r.churn_risk_score >= 60).length;
  const freeCount = restaurants.filter((r) => r.plan === 'starter').length;

  return (
    <div className="min-h-screen bg-surface">
      {/* ══ HEADER — compact, dark ═══════════════════════════════ */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-bold tracking-wide uppercase">{t('admin.title')}</h1>
            {growthSummary?.kpiFreshness && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                growthSummary.kpiFreshness === 'fresh' ? 'bg-emerald-500/20 text-emerald-400' :
                growthSummary.kpiFreshness === 'stale' ? 'bg-amber-500/20 text-amber-400' :
                'bg-gray-700 text-gray-400'
              }`}>
                {growthSummary.kpiFreshness === 'fresh' ? t('admin.statusFresh') : growthSummary.kpiFreshness === 'stale' ? t('admin.statusStale') : t('admin.statusMissing')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleRecompute} disabled={recomputing}
              className="text-xs font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50">
              {recomputing ? t('admin.computing') : t('admin.recomputeKpis')}
            </button>
            <span className="w-px h-4 bg-gray-700" />
            <a href={`/${locale}/admin/plans`} className="text-xs text-gray-400 hover:text-white transition-colors">{t('admin.plans')}</a>
            <a href={`/${locale}/admin/kpis`} className="text-xs text-gray-400 hover:text-white transition-colors">{t('admin.kpis')}</a>
            <a href={`/${locale}/admin/wallet`} className="text-xs text-gray-400 hover:text-white transition-colors">{t('admin.walletStudio')}</a>
            <span className="w-px h-4 bg-gray-700" />
            <button onClick={handleSeedDemo} disabled={seeding} className="text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50">
              {seeding ? t('demo.seeding') : t('demo.seedBtn')}
            </button>
            <a href={`/${locale}/dashboard`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">{t('admin.backToDashboard')}</a>
          </div>
        </div>
      </header>

      {/* ══ RECOMPUTE TOAST ══════════════════════════════════════ */}
      {recomputeMsg && (
        <div className={`text-center py-2 text-xs font-medium ${recomputeMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {recomputeMsg.text}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ══ KPI BAR — single row, 6 metrics ═══════════════════ */}
        {!loading && !error && (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: t('admin.totalRestaurants'), value: restaurants.length, color: 'text-gray-900' },
              { label: t('admin.scansYesterday'),   value: totalScans,         color: 'text-gray-900' },
              { label: t('admin.freePlans'),         value: freeCount,          color: 'text-gray-900' },
              { label: t('admin.churnRiskHigh'),     value: churnHighCount,     color: churnHighCount > 0 ? 'text-red-600' : 'text-gray-900' },
              { label: t('admin.readyToUpgrade'),    value: growthSummary?.upgrade_ready_count ?? 0, color: (growthSummary?.upgrade_ready_count ?? 0) > 0 ? 'text-blue-600' : 'text-gray-900' },
              { label: t('admin.pendingActions'),     value: actionsLoading ? '…' : pendingActions.length, color: pendingActions.length > 0 ? 'text-amber-600' : 'text-gray-900' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{kpi.label}</p>
                <p className={`text-xl font-bold mt-0.5 tabular-nums ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ══ ACTIONS — visual cards grid ════════════════════════ */}
        {pendingActions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('admin.pendingActionsTitle')} ({pendingActions.length})</p>
              <button onClick={fetchActions} className="text-xs text-primary-600 hover:text-primary-700 font-medium">{t('common.refresh')}</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingActions.slice(0, 9).map((action) => {
                const sev = action.payload.severity;
                const border = sev === 'high' ? 'border-l-red-500' : sev === 'medium' ? 'border-l-amber-500' : 'border-l-gray-300';
                const icon = action.payload.type === 'risk' ? '🔴' : action.payload.type === 'upgrade' ? '🔵' : '🟢';
                return (
                  <div key={action.id}
                    className={`bg-white rounded-xl border border-gray-100 border-l-4 ${border} shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => router.push(`/admin/${action.restaurant_id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs">{icon}</span>
                          <p className="text-xs font-bold text-gray-900 truncate">{action.restaurants?.name ?? '—'}</p>
                        </div>
                        <p className="text-xs font-medium text-gray-700 leading-snug">{action.payload.title}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDismissAction(action.id); }}
                        disabled={dismissingId === action.id}
                        className="text-gray-300 hover:text-gray-500 text-xs flex-shrink-0 disabled:opacity-50"
                      >✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {pendingActions.length > 9 && (
              <p className="text-xs text-gray-400 text-center mt-2">+ {pendingActions.length - 9} {t('admin.moreActions')}</p>
            )}
          </div>
        )}

        {/* ══ FILTERS + TABLE ═══════════════════════════════════ */}
        <div className="flex items-center gap-2">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f.key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>{f.label}</button>
          ))}
          <button onClick={fetchData} className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors">{t('common.refresh')}</button>
        </div>

        {error && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12 text-center">
            <div className="inline-block w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            {restaurants.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">{t('admin.noMatch')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr>
                      <SortTh label={t('admin.headerRestaurant')} field="name" currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">{t('admin.headerPlan')}</th>
                      <SortTh label={t('admin.headerHealth')} field="health" currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <SortTh label={t('admin.headerChurn')} field="churn" currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <SortTh label={t('admin.headerClients')} field="customers" currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <SortTh label={t('admin.headerScans')} field="scans" currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {restaurants.map((r) => {
                      const healthColor = r.health_score >= 70 ? 'bg-emerald-500' : r.health_score >= 40 ? 'bg-amber-500' : 'bg-red-500';
                      const churnColor = r.churn_risk_score >= 70 ? 'bg-red-500' : r.churn_risk_score >= 40 ? 'bg-amber-500' : 'bg-gray-200';
                      const isAtRisk = r.churn_risk_score >= 60;
                      return (
                        <tr key={r.id}
                          className={`cursor-pointer transition-colors ${isAtRisk ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-gray-50'}`}
                          onClick={() => router.push(`/admin/${r.id}`)}
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">{r.name}</p>
                            <p className="text-[10px] text-gray-400">{r.slug}</p>
                          </td>
                          <td className="px-4 py-3"><PlanBadge plan={r.plan} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${healthColor}`} style={{ width: `${r.health_score}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-gray-600 tabular-nums w-6">{r.health_score}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${churnColor}`} style={{ width: `${r.churn_risk_score}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-gray-600 tabular-nums w-6">{r.churn_risk_score}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700 tabular-nums text-xs font-medium">{r.total_customers.toLocaleString(locale)}</td>
                          <td className="px-4 py-3 text-gray-700 tabular-nums text-xs font-medium">{r.scans_yesterday}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleImpersonate(r.id); }}
                              className="text-gray-400 hover:text-amber-600 transition-colors p-1"
                              title={t('demo.impersonateBtn')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
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
      </main>
    </div>
  );
}
