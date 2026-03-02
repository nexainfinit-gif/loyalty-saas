'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface TrendRow {
  date:                    string;
  scans_count:             number;
  unique_customers_scanned: number;
  registrations_count:     number;
  rewards_triggered_count: number;
  active_customers_30d:    number;
  total_customers:         number;
  wallet_passes_issued:    number;
}

interface Restaurant {
  id:               string;
  name:             string;
  slug:             string;
  plan:             string;
  primary_color:    string | null;
  logo_url:         string | null;
  created_at:       string;
  health_score:     number;
  upgrade_score:    number;
  churn_risk_score: number;
  reasons:          string[];
  snapshot_at:      string | null;
}

interface Totals {
  customers:     number;
  scans:         number;
  wallet_passes: number;
}

/* ── Score ring ─────────────────────────────────────────────────────────────── */

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 32;
  const circ   = 2 * Math.PI * radius;
  const pct    = value / 100;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="8" />
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900">
          {value}
        </span>
      </div>
      <span className="text-xs font-medium text-gray-500">{label}</span>
    </div>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </p>
    </div>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { color: string; name: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">
        {label ? new Date(label).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}
      </p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-gray-600">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminRestaurantDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const restaurantId = params.id;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [totals, setTotals]         = useState<Totals | null>(null);
  const [trend, setTrend]           = useState<TrendRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    fetch(`/api/admin/restaurants/${restaurantId}`)
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) { router.replace('/dashboard'); return; }
        if (res.status === 404) { setError('Restaurant introuvable.'); return; }
        if (!res.ok) throw new Error('Erreur serveur');
        const json = await res.json();
        setRestaurant(json.restaurant);
        setTotals(json.totals);
        setTrend(json.trend ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [restaurantId, router]);

  /* Format date label for chart X-axis */
  function fmtDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  const chartData = trend.map((d) => ({
    date:          d.date,
    Scans:         d.scans_count,
    'Clients uniques': d.unique_customers_scanned,
    Inscriptions:  d.registrations_count,
  }));

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 mt-4">Chargement…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-medium">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-primary-600 hover:underline"
          >
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  if (!restaurant || !totals) return null;

  const scoreColor = (restaurant.health_score >= 70) ? '#10b981'
    : restaurant.health_score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {restaurant.logo_url && (
              <img src={restaurant.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover border border-gray-100" />
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{restaurant.name}</h1>
              <p className="text-sm text-gray-400">/{restaurant.slug} · Plan {restaurant.plan}</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Tous les restaurants
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Scores row */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <div className="flex flex-wrap items-start gap-8">
            {/* Score rings */}
            <div className="flex gap-6">
              <ScoreRing value={restaurant.health_score}     label="Santé"   color={scoreColor} />
              <ScoreRing value={restaurant.upgrade_score}    label="Upgrade" color="#4f6bed" />
              <ScoreRing value={restaurant.churn_risk_score} label="Churn"   color="#ef4444" />
            </div>

            {/* Reasons */}
            {restaurant.reasons.length > 0 && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Signaux détectés</p>
                <ul className="space-y-1.5">
                  {restaurant.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-0.5 text-gray-300">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Snapshot date */}
            {restaurant.snapshot_at && (
              <div className="text-xs text-gray-400 self-end ml-auto">
                Calculé le {new Date(restaurant.snapshot_at).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </div>
            )}
          </div>
        </div>

        {/* Lifetime totals */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Total clients" value={totals.customers} />
          <StatCard label="Total scans"   value={totals.scans} />
          <StatCard label="Passes wallet actifs" value={totals.wallet_passes} />
        </div>

        {/* 30-day trend chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-6">Activité — 30 derniers jours</h2>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">
              Aucune donnée pour les 30 derniers jours.
              <br />
              Le cron doit être exécuté au moins une fois.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gScans" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4f6bed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f6bed" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gUnique" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 16, color: '#6b7280' }}
                />
                <Area
                  type="monotone" dataKey="Scans"
                  stroke="#4f6bed" strokeWidth={2}
                  fill="url(#gScans)"
                  dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone" dataKey="Clients uniques"
                  stroke="#10b981" strokeWidth={2}
                  fill="url(#gUnique)"
                  dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone" dataKey="Inscriptions"
                  stroke="#f59e0b" strokeWidth={2}
                  fill="url(#gReg)"
                  dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Actions rapides</h2>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/register/${restaurant.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
            >
              Voir page inscription →
            </a>
            <p className="text-xs text-gray-400 self-center">
              Inscrit le {new Date(restaurant.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
