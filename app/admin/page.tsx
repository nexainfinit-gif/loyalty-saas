'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ── Types ──────────────────────────────────────────────────────────────────── */

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
    free:  'bg-gray-100 text-gray-500',
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
              href="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* KPI summary row */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total restaurants', value: restaurants.length },
              { label: 'Plans gratuits', value: restaurants.filter((r) => r.plan === 'free').length },
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
