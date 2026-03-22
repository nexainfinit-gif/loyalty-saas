'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';
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
  plan_id:          string | null;
  primary_color:    string | null;
  logo_url:         string | null;
  created_at:       string;
  health_score:     number;
  upgrade_score:    number;
  churn_risk_score: number;
  reasons:          string[];
  snapshot_at:      string | null;
}

interface PlanOption {
  id:   string;
  key:  string;
  name: string;
}

interface Totals {
  customers:     number;
  scans:         number;
  wallet_passes: number;
}

interface KpiMetrics {
  total_customers:       number;
  new_customers_30d:     number;
  active_customers_30d:  number;
  visits_30d:            number;
  repeat_rate:           number;
  wallet_passes_issued:  number;
  wallet_active_passes:  number;
  completed_cards:       number;
  estimated_revenue_30d: number | null;
  last_activity_at:      string | null;
  last_computed_at:      string;
}

interface GrowthAction {
  id:            string;
  trigger_key:   string;
  action_type:   string;
  payload:       {
    type:           string;
    severity:       string;
    title:          string;
    message:        string;
    suggested_plan?: string | null;
  };
  status:      string;
  created_at:  string;
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
  const { locale } = useTranslation();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString(locale) : value}
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
  const { locale } = useTranslation();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">
        {label ? new Date(label).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''}
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
  const router = useLocaleRouter();
  const { t, locale } = useTranslation();
  const params = useParams<{ id: string }>();
  const restaurantId = params.id;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [totals, setTotals]         = useState<Totals | null>(null);
  const [trend, setTrend]           = useState<TrendRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [kpiMetrics, setKpiMetrics] = useState<KpiMetrics | null>(null);
  const [plans, setPlans]                   = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [savingPlan, setSavingPlan]         = useState(false);
  const [planMsg, setPlanMsg]               = useState('');
  const [restaurantActions, setRestaurantActions] = useState<GrowthAction[]>([]);
  const [dismissingId, setDismissingId]           = useState<string | null>(null);
  const [period, setPeriod] = useState<number>(30);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/admin/restaurants/${restaurantId}?period=${period}`),
      fetch('/api/admin/plans'),
      fetch(`/api/admin/growth/actions?restaurant_id=${restaurantId}&limit=50`),
    ])
      .then(async ([restRes, plansRes, actionsRes]) => {
        if (restRes.status === 401 || restRes.status === 403) { router.replace('/dashboard'); return; }
        if (restRes.status === 404) { setError(t('admin.detailNotFound')); return; }
        if (!restRes.ok) throw new Error(t('api.serverError'));
        const restJson    = await restRes.json();
        const plansJson   = plansRes.ok    ? await plansRes.json()    : { plans: [] };
        const actionsJson = actionsRes.ok  ? await actionsRes.json()  : { actions: [] };
        setRestaurant(restJson.restaurant);
        setTotals(restJson.totals);
        setTrend(restJson.trend ?? []);
        setKpiMetrics(restJson.kpiMetrics ?? null);
        setPlans(plansJson.plans ?? []);
        setSelectedPlanId(restJson.restaurant?.plan_id ?? '');
        setRestaurantActions(actionsJson.actions ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [restaurantId, router, period]);

  async function handleUpdatePlan() {
    if (!selectedPlanId || !restaurantId) return;
    setSavingPlan(true);
    setPlanMsg('');
    try {
      const res = await fetch(`/api/admin/restaurants/${restaurantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: selectedPlanId }),
      });
      const json = await res.json();
      if (!res.ok) { setPlanMsg(json.error ?? t('api.serverError')); return; }
      setRestaurant((r) => r ? { ...r, plan: json.restaurant.plan, plan_id: json.restaurant.plan_id } : r);
      setPlanMsg(t('admin.planUpdated'));
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleDismissAction(actionId: string) {
    setDismissingId(actionId);
    try {
      const res = await fetch(`/api/admin/growth/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (res.ok) {
        setRestaurantActions((prev) => prev.filter((a) => a.id !== actionId));
      }
    } catch {/* ignore */} finally {
      setDismissingId(null);
    }
  }

  /* Format date label for chart X-axis */
  function fmtDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
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
          <p className="text-sm text-gray-400 mt-4">{t('admin.loadingData')}</p>
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
            {t('admin.detailBack')}
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
            {t('admin.detailBackAll')}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Scores row */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <div className="flex flex-wrap items-start gap-8">
            {/* Score rings */}
            <div className="flex gap-6">
              <ScoreRing value={restaurant.health_score}     label={t('admin.detailHealth')}   color={scoreColor} />
              <ScoreRing value={restaurant.upgrade_score}    label={t('admin.detailUpgrade')} color="#4f6bed" />
              <ScoreRing value={restaurant.churn_risk_score} label={t('admin.detailChurn')}   color="#ef4444" />
            </div>

            {/* Reasons */}
            {restaurant.reasons.length > 0 && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t('admin.detailSignals')}</p>
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
                {t('admin.detailComputedAt', { date: new Date(restaurant.snapshot_at).toLocaleDateString(locale, {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) })}
              </div>
            )}
          </div>
        </div>

        {/* Lifetime totals */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label={t('admin.detailTotalClients')} value={totals.customers} />
          <StatCard label={t('admin.detailTotalScans')}   value={totals.scans} />
          <StatCard label={t('admin.detailActivePasses')} value={totals.wallet_passes} />
        </div>

        {/* Pre-computed KPI metrics */}
        {kpiMetrics ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-700">{t('admin.detailKpiTitle')}</h2>
              <p className="text-xs text-gray-400">
                {t('admin.detailKpiDate', { date: new Date(kpiMetrics.last_computed_at).toLocaleDateString(locale, {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                }) })}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
              {[
                { label: 'Nouveaux 30j',     value: kpiMetrics.new_customers_30d },
                { label: 'Actifs 30j',       value: kpiMetrics.active_customers_30d },
                { label: 'Scans 30j',        value: kpiMetrics.visits_30d },
                { label: 'Taux fidélité',    value: `${Number(kpiMetrics.repeat_rate).toFixed(0)}%` },
                { label: 'Wallet émis',      value: kpiMetrics.wallet_passes_issued },
                { label: 'Wallet actifs',    value: kpiMetrics.wallet_active_passes },
                { label: 'Cartes compl.',    value: kpiMetrics.completed_cards },
                {
                  label: 'Revenu estimé',
                  value: kpiMetrics.estimated_revenue_30d != null
                    ? `${Number(kpiMetrics.estimated_revenue_30d).toLocaleString(locale)} €`
                    : '—',
                },
                {
                  label: 'Dernière activité',
                  value: kpiMetrics.last_activity_at
                    ? new Date(kpiMetrics.last_activity_at).toLocaleDateString(locale)
                    : '—',
                },
              ].map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{String(m.value)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 px-5 py-4 text-sm text-gray-400">
            {t('admin.detailNoKpi')}
          </div>
        )}

        {/* Growth actions for this restaurant */}
        {restaurantActions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">{t('admin.detailPendingActions')}</p>
              <p className="text-xs text-gray-400 mt-0.5">{restaurantActions.length} — {t('admin.detailActionsBy')}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {restaurantActions.map((action) => {
                const sev = action.payload.severity;
                const sevColor =
                  sev === 'high'   ? 'text-red-600 bg-red-50' :
                  sev === 'medium' ? 'text-amber-700 bg-amber-50' :
                                     'text-gray-500 bg-gray-100';
                return (
                  <div key={action.id} className="px-5 py-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sevColor}`}>
                          {sev}
                        </span>
                        <span className="text-xs text-gray-400">{action.action_type.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-300">· {action.trigger_key}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{action.payload.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{action.payload.message}</p>
                      {action.payload.suggested_plan && (
                        <p className="text-xs text-primary-600 font-medium mt-1">
                          Plan suggéré : {action.payload.suggested_plan}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDismissAction(action.id)}
                      disabled={dismissingId === action.id}
                      className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-50"
                    >
                      {dismissingId === action.id ? '…' : 'Ignorer'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trend chart with period selector */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-gray-700">
              Activité — {period === 365 ? '1 an' : `${period} derniers jours`}
              {trend.length > 0 && <span className="text-xs text-gray-400 font-normal ml-2">({trend.length}j de données)</span>}
            </h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {[
                { value: 7,   label: '7j' },
                { value: 30,  label: '30j' },
                { value: 90,  label: '90j' },
                { value: 365, label: '1 an' },
              ].filter(p => {
                // Hide periods that have no more data than the previous option
                const dataSpan = trend.length;
                if (p.value === 7) return true;
                return dataSpan >= p.value * 0.5; // show if at least 50% of the period has data
              }).map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >{p.label}</button>
              ))}
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">
              Aucune donnée pour cette période.
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

        {/* Plan assignment */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Plan d&apos;abonnement</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-500 mb-1">Plan actuel</label>
              <select
                value={selectedPlanId}
                onChange={(e) => { setSelectedPlanId(e.target.value); setPlanMsg(''); }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20 bg-white"
              >
                <option value="">— Sélectionner un plan —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleUpdatePlan}
              disabled={savingPlan || !selectedPlanId}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {savingPlan ? 'Mise à jour…' : 'Mettre à jour'}
            </button>
            {planMsg && (
              <span className={`text-xs font-medium ${planMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                {planMsg}
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Actions rapides</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                await fetch('/api/admin/impersonate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ restaurant_id: restaurant.id }),
                });
                window.location.href = `/${locale}/dashboard`;
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {t('demo.impersonateBtn')}
            </button>
            <a
              href={`/register/${restaurant.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
            >
              Voir page inscription →
            </a>
            <p className="text-xs text-gray-400 self-center">
              Inscrit le {new Date(restaurant.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
