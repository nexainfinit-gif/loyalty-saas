'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();

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
      if (!res.ok) throw new Error('Erreur serveur');
      const json = await res.json();
      setRestaurants(json.restaurants ?? []);
      setDate(json.date ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, sort, order, router]);

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
        setRecomputeMsg({ text: `Calcul trop récent — réessayez dans ${json.retry_after_seconds}s.`, ok: false });
        return;
      }
      if (!res.ok) {
        setRecomputeMsg({ text: json.error ?? 'Erreur serveur.', ok: false });
        return;
      }
      setRecomputeMsg({
        text: `✓ ${json.restaurantsProcessed} restaurants recalculés en ${json.durationMs} ms.`,
        ok: true,
      });
      // Refresh freshness indicator
      setGrowthSummary((prev) => prev
        ? { ...prev, kpiLastComputedAt: json.computedAt, kpiFreshness: 'fresh' }
        : prev,
      );
    } catch {
      setRecomputeMsg({ text: 'Erreur réseau.', ok: false });
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
    { key: 'all',     label: 'Tous' },
    { key: 'upgrade', label: 'À upgrader' },
    { key: 'churn',   label: 'Risque churn' },
    { key: 'free',    label: 'Plan gratuit' },
  ];

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin — Growth Dashboard</h1>
            {date && (
              <p className="text-sm text-gray-400 mt-0.5">
                Métriques du {new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/admin/plans"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              Plans
            </a>
            <a
              href="/admin/kpis"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              KPIs
            </a>
            <a
              href="/admin/wallet"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              Wallet Studio
            </a>
            <a
              href="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* KPI freshness warning banner */}
        {growthSummary && (growthSummary.kpiFreshness === 'stale' || growthSummary.kpiFreshness === 'missing') && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
            growthSummary.kpiFreshness === 'missing'
              ? 'bg-gray-50 border border-gray-200 text-gray-600'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}>
            <span className="text-base flex-shrink-0">
              {growthSummary.kpiFreshness === 'missing' ? '⚙️' : '⚠️'}
            </span>
            <p className="flex-1">
              {growthSummary.kpiFreshness === 'missing'
                ? 'Aucune donnée KPI — le cron /api/cron/metrics n\'a pas encore été exécuté.'
                : `KPIs obsolètes — dernier calcul le ${new Date(growthSummary.kpiLastComputedAt!).toLocaleString('fr-FR')}. Cliquez sur "Recalculer" ci-dessous.`}
            </p>
            <button
              onClick={handleRecompute}
              disabled={recomputing}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white border border-current transition-opacity disabled:opacity-50"
            >
              {recomputing ? 'Calcul…' : 'Recalculer'}
            </button>
          </div>
        )}

        {/* Metrics Engine card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Metrics Engine</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {growthSummary?.kpiLastComputedAt
                  ? `Dernier calcul : ${new Date(growthSummary.kpiLastComputedAt).toLocaleString('fr-FR')}`
                  : 'Aucun calcul enregistré'}
                {growthSummary?.kpiFreshness && (
                  <span className={`ml-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    growthSummary.kpiFreshness === 'fresh'
                      ? 'bg-emerald-50 text-emerald-700'
                      : growthSummary.kpiFreshness === 'stale'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {growthSummary.kpiFreshness === 'fresh' ? 'Frais' : growthSummary.kpiFreshness === 'stale' ? 'Obsolète' : 'Manquant'}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {recomputeMsg && (
                <p className={`text-xs font-medium ${recomputeMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {recomputeMsg.text}
                </p>
              )}
              <button
                onClick={handleRecompute}
                disabled={recomputing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recomputing ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Calcul en cours…
                  </>
                ) : (
                  'Recalculer KPIs'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* KPI summary row */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total restaurants', value: restaurants.length },
              { label: 'Plans gratuits', value: restaurants.filter((r) => r.plan === 'starter').length },
              { label: 'Scans hier (total)', value: restaurants.reduce((s, r) => s + r.scans_yesterday, 0) },
              { label: 'Risque churn ≥ 60', value: restaurants.filter((r) => r.churn_risk_score >= 60).length },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Growth summary row */}
        {growthSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <p className="text-xs text-gray-500 font-medium">Risque churn (score ≥ 60)</p>
              <p className={`text-2xl font-bold mt-1 ${growthSummary.churn_risk_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {growthSummary.churn_risk_count}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <p className="text-xs text-gray-500 font-medium">Prêts à upgrader (free, score ≥ 50)</p>
              <p className={`text-2xl font-bold mt-1 ${growthSummary.upgrade_ready_count > 0 ? 'text-blue-600' : 'text-gray-900'}`}>
                {growthSummary.upgrade_ready_count}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <p className="text-xs text-gray-500 font-medium">Restaurants plan gratuit</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{growthSummary.free_count}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <p className="text-xs text-gray-500 font-medium">Actions en attente</p>
              <p className={`text-2xl font-bold mt-1 ${pendingActions.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                {actionsLoading ? '…' : pendingActions.length}
              </p>
            </div>
          </div>
        )}

        {/* Growth Actions panel */}
        {pendingActions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Actions de croissance en attente</p>
                <p className="text-xs text-gray-400 mt-0.5">{pendingActions.length} action{pendingActions.length > 1 ? 's' : ''} · cliquez sur un restaurant pour agir</p>
              </div>
              <button
                onClick={fetchActions}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
              >
                Actualiser
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {pendingActions.slice(0, 20).map((action) => {
                const sev = action.payload.severity;
                const sevColor =
                  sev === 'high'   ? 'text-red-600 bg-red-50' :
                  sev === 'medium' ? 'text-amber-700 bg-amber-50' :
                                     'text-gray-500 bg-gray-100';
                const typeColor =
                  action.payload.type === 'risk'        ? 'text-red-600' :
                  action.payload.type === 'upgrade'     ? 'text-blue-600' :
                                                          'text-emerald-600';
                return (
                  <div key={action.id} className="px-5 py-3.5 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => router.push(`/admin/${action.restaurant_id}`)}
                          className="text-sm font-semibold text-gray-900 hover:text-primary-600 transition-colors truncate"
                        >
                          {action.restaurants?.name ?? action.restaurant_id.slice(0, 8)}
                        </button>
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sevColor}`}>
                          {sev}
                        </span>
                        <span className={`text-xs font-medium ${typeColor}`}>
                          {action.payload.type}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-gray-700 mt-0.5">{action.payload.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{action.payload.message}</p>
                    </div>
                    <button
                      onClick={() => handleDismissAction(action.id)}
                      disabled={dismissingId === action.id}
                      className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 mt-0.5"
                      title="Ignorer"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {pendingActions.length > 20 && (
                <p className="px-5 py-3 text-xs text-gray-400 text-center">
                  + {pendingActions.length - 20} autres actions — filtrez par restaurant pour tout voir
                </p>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            Actualiser
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
            <p className="text-sm text-gray-400 mt-3">Chargement des données…</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            {restaurants.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">
                Aucun restaurant ne correspond à ce filtre.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <SortTh label="Restaurant"  field="name"      currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</th>
                      <SortTh label="Santé"        field="health"    currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <SortTh label="Upgrade"      field="upgrade"   currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <SortTh label="Churn"        field="churn"     currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <SortTh label="Clients"      field="customers" currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <SortTh label="Scans hier"   field="scans"     currentSort={sort} currentOrder={order} onSort={handleSort} />
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Actifs 30j</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {restaurants.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/admin/${r.id}`)}
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-gray-900">{r.name}</p>
                          <p className="text-xs text-gray-400">{r.slug}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <PlanBadge plan={r.plan} />
                        </td>
                        <td className="px-4 py-3.5">
                          <ScoreBadge value={r.health_score} type="health" />
                        </td>
                        <td className="px-4 py-3.5">
                          <ScoreBadge value={r.upgrade_score} type="upgrade" />
                        </td>
                        <td className="px-4 py-3.5">
                          <ScoreBadge value={r.churn_risk_score} type="churn" />
                        </td>
                        <td className="px-4 py-3.5 text-gray-700 tabular-nums">
                          {r.total_customers.toLocaleString('fr-FR')}
                        </td>
                        <td className="px-4 py-3.5 text-gray-700 tabular-nums">
                          {r.scans_yesterday}
                        </td>
                        <td className="px-4 py-3.5 text-gray-700 tabular-nums">
                          {r.active_30d}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-primary-600 text-xs font-medium">Voir →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          Scores calculés chaque nuit à 01:00 UTC · Accès réservé aux propriétaires de la plateforme
        </p>
      </main>
    </div>
  );
}
