'use client';
import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';

/* ─── Design System tokens (CSS vars for Recharts) ─ */
const DS = {
  primary: 'var(--color-primary-600)',
  purple:  'var(--color-purple-600)',
  success: 'var(--color-success-600)',
  warning: 'var(--color-warning-600)',
  danger:  'var(--color-danger-600)',
  gray100: 'var(--color-gray-100)',
  gray200: 'var(--color-gray-200)',
  gray400: 'var(--color-gray-400)',
} as const;

/* ─── Types ─────────────────────────────────────────────── */
interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  total_points: number;
  total_visits: number;
  birth_date: string | null;
  last_visit_at: string | null;
  created_at: string;
  stamps_count: number;
  completed_cards: number;
}

interface Transaction {
  id: string;
  created_at: string;
  points_delta: number;
  type: string;
  customer_id: string;
}

interface GrowthTrigger {
  key: string;
  type: 'upgrade' | 'risk' | 'opportunity';
  severity: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  suggested_plan?: string;
}

interface RestaurantMetrics {
  total_customers: number;
  visits_30d: number;
  last_computed_at: string;
  new_customers_30d?: number;
  active_customers_30d?: number;
  repeat_rate?: number;
  wallet_passes_issued?: number;
  wallet_active_passes?: number;
  completed_cards?: number;
  estimated_revenue_30d?: number | null;
}

interface LoyaltySettings {
  points_per_scan: number;
  reward_threshold: number;
  reward_message: string;
  program_type: 'points' | 'stamps';
  stamps_total: number;
}

interface Props {
  customers: Customer[];
  transactions: Transaction[];
  growthTriggers: GrowthTrigger[];
  triggersLoading: boolean;
  restaurantMetrics: RestaurantMetrics | null | undefined;
  loyaltySettings: LoyaltySettings;
  plan: string;
  isPaidPlan: boolean;
  totalCustomers: number;
  onUpgrade: () => void;
  onTabChange: (tab: string) => void;
  onFilterChange: (filter: string) => void;
  onCampaignOpen: () => void;
  restaurantSlug?: string;
}

type Period = '7d' | '30d' | '90d';

/* ─── Helpers ───────────────────────────────────────────── */
const NOW = Date.now();
const MS_DAY = 86400000;

function getCustomerStatus(c: Customer): 'vip' | 'active' | 'inactive' {
  if (!c.last_visit_at) return 'inactive';
  const days = (NOW - new Date(c.last_visit_at).getTime()) / MS_DAY;
  if (days > 30) return 'inactive';
  if (c.total_points >= 100) return 'vip';
  return 'active';
}

function trendPct(a: number, b: number): number | null {
  if (b === 0) return a > 0 ? 100 : null;
  return Math.round(((a - b) / b) * 100);
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">—</span>;
  if (value >= 0) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-700 bg-success-50 px-2 py-0.5 rounded-full">+{value}%</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-700 bg-danger-50 px-2 py-0.5 rounded-full">{value}%</span>;
}

function SIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ─── Main component ────────────────────────────────────── */
export default function OverviewTab({
  customers,
  transactions,
  growthTriggers,
  triggersLoading,
  restaurantMetrics,
  loyaltySettings,
  plan,
  isPaidPlan,
  totalCustomers,
  onUpgrade,
  onTabChange,
  onFilterChange,
  onCampaignOpen,
  restaurantSlug,
}: Props) {
  const [period, setPeriod] = useState<Period>('30d');
  const today = new Date();

  const periodMs = period === '7d' ? 7 * MS_DAY : period === '30d' ? 30 * MS_DAY : 90 * MS_DAY;
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  /* ── Computed KPIs ── */
  const kpis = useMemo(() => {
    const activeCustomers = customers.filter(c => c.last_visit_at && (NOW - new Date(c.last_visit_at).getTime()) < periodMs).length;
    const inactiveCustomers = customers.filter(c => !c.last_visit_at || (NOW - new Date(c.last_visit_at).getTime()) > 45 * MS_DAY).length;
    const newCustomers = customers.filter(c => (NOW - new Date(c.created_at).getTime()) < periodMs).length;
    const prevNewCustomers = customers.filter(c => {
      const age = NOW - new Date(c.created_at).getTime();
      return age >= periodMs && age < 2 * periodMs;
    }).length;

    const activeThisPeriod = new Set(
      transactions.filter(t => NOW - new Date(t.created_at).getTime() < periodMs).map(t => t.customer_id)
    ).size;
    const activePrevPeriod = new Set(
      transactions.filter(t => { const age = NOW - new Date(t.created_at).getTime(); return age >= periodMs && age < 2 * periodMs; }).map(t => t.customer_id)
    ).size;

    const returnRate = totalCustomers > 0 ? Math.round((customers.filter(c => c.total_visits > 1).length / totalCustomers) * 100) : 0;
    const completedCards = customers.reduce((sum, c) => sum + (c.completed_cards ?? 0), 0);
    const rewardsThisPeriod = transactions.filter(t => t.type === 'reward_redeem' && (NOW - new Date(t.created_at).getTime()) < periodMs).length;
    const visitsThisPeriod = transactions.filter(t => t.type === 'visit' && (NOW - new Date(t.created_at).getTime()) < periodMs).length;

    const vipCustomers = customers.filter(c => getCustomerStatus(c) === 'vip').length;

    const nearReward = loyaltySettings.program_type === 'stamps'
      ? customers.filter(c => (c.stamps_count ?? 0) >= loyaltySettings.stamps_total - 2 && (c.stamps_count ?? 0) < loyaltySettings.stamps_total).length
      : customers.filter(c => c.total_points >= loyaltySettings.reward_threshold * 0.8 && c.total_points < loyaltySettings.reward_threshold).length;

    const in7days = new Date(); in7days.setDate(today.getDate() + 7);
    const birthdaysSoon = customers.filter(c => {
      if (!c.birth_date) return false;
      const b = new Date(c.birth_date);
      const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
      return next >= today && next <= in7days;
    }).length;

    return {
      activeCustomers,
      inactiveCustomers,
      newCustomers,
      prevNewCustomers,
      activeThisPeriod,
      activePrevPeriod,
      returnRate,
      completedCards,
      rewardsThisPeriod,
      visitsThisPeriod,
      vipCustomers,
      nearReward,
      birthdaysSoon,
      trendNew: trendPct(newCustomers, prevNewCustomers),
      trendActive: trendPct(activeThisPeriod, activePrevPeriod),
    };
  }, [customers, transactions, totalCustomers, periodMs, loyaltySettings, today]);

  /* ── Chart data ── */
  const chartData = useMemo(() => {
    return Array.from({ length: periodDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (periodDays - 1 - i));
      const dayStr = d.toISOString().split('T')[0];
      return {
        date: d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' }),
        Inscriptions: customers.filter(c => c.created_at.startsWith(dayStr)).length,
        Visites: transactions.filter(t => t.created_at.startsWith(dayStr) && t.type === 'visit').length,
      };
    });
  }, [customers, transactions, periodDays]);

  /* ── Weekly chart (last 8 weeks) ── */
  const weeklyData = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);
      const count = customers.filter(c => {
        const d = new Date(c.created_at);
        return d >= weekStart && d < weekEnd;
      }).length;
      return {
        week: `S-${8 - i}`,
        Clients: count,
      };
    });
  }, [customers]);

  /* ── Health status ── */
  const highRiskCount = growthTriggers.filter(t => t.type === 'risk' && t.severity === 'high').length;
  const medRiskCount = growthTriggers.filter(t => t.type === 'risk' && t.severity === 'medium').length;
  const oppCount = growthTriggers.filter(t => t.type === 'opportunity').length;
  type HealthStatus = { label: string; bg: string; text: string; dot: string; icon: string };
  const healthStatus: HealthStatus = highRiskCount > 0
    ? { label: 'Attention requise', bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-600', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' }
    : medRiskCount > 0
    ? { label: 'A surveiller', bg: 'bg-warning-50', text: 'text-warning-700', dot: 'bg-warning-600', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }
    : { label: 'Programme en bonne sante', bg: 'bg-success-50', text: 'text-success-700', dot: 'bg-success-600', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' };

  /* ── Sorted triggers ── */
  const SEV: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedTriggers = [...growthTriggers].sort((a, b) => (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9));

  function handleTriggerCta(trigger: GrowthTrigger) {
    const k = trigger.key ?? '';
    if (['churn_risk_high', 'inactive_majority', 'churn_risk_medium', 're_engagement', 'growth_momentum'].includes(k))
      onTabChange('campaigns');
    else if (k === 'engagement_drop') { onFilterChange('inactive'); onTabChange('clients'); }
    else if (k === 'growth_stalled' && restaurantSlug)
      navigator.clipboard?.writeText?.(`${window.location.origin}/register/${restaurantSlug}`);
    else if (k === 'campaign_underused') onCampaignOpen();
    else if (k === 'no_rewards_issued') onTabChange('loyalty');
    else if (k === 'missing_avg_ticket') onTabChange('settings');
    else onTabChange(trigger.type === 'upgrade' ? 'settings' : 'campaigns');
  }

  /* ── Auto-insights ── */
  const insights = useMemo(() => {
    const list: { icon: string; text: string; type: 'success' | 'warning' | 'info' }[] = [];

    if (kpis.returnRate > 50) list.push({ icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', text: `Excellent taux de retour (${kpis.returnRate}%) — vos clients reviennent regulierement.`, type: 'success' });
    else if (kpis.returnRate > 0) list.push({ icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', text: `Taux de retour de ${kpis.returnRate}% — une campagne de relance pourrait aider.`, type: 'warning' });

    if (kpis.inactiveCustomers > 0) list.push({ icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', text: `${kpis.inactiveCustomers} clients inactifs depuis 45j — opportunite de re-engagement.`, type: 'warning' });

    if (kpis.nearReward > 0) list.push({ icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7', text: `${kpis.nearReward} clients proches de la recompense — envoyez-leur un rappel !`, type: 'info' });

    if (kpis.newCustomers > 0 && kpis.trendNew !== null && kpis.trendNew > 0) list.push({ icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', text: `${kpis.newCustomers} nouveaux clients cette periode (+${kpis.trendNew}%) — belle dynamique !`, type: 'success' });
    else if (kpis.newCustomers === 0) list.push({ icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', text: `Aucun nouveau client cette periode. Partagez votre lien d'inscription.`, type: 'warning' });

    if (kpis.birthdaysSoon > 0) list.push({ icon: 'M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0A1.75 1.75 0 003 17.25v.763c0 .414.336.75.75.75h16.5a.75.75 0 00.75-.75v-.764a1.75 1.75 0 00-.75-1.703zM4.5 6.75a.75.75 0 01.75-.75h13.5a.75.75 0 01.75.75v7.5H4.5v-7.5z', text: `${kpis.birthdaysSoon} anniversaire(s) dans les 7 prochains jours.`, type: 'info' });

    return list;
  }, [kpis]);

  /* ── Segments ── */
  const segments = [
    { label: 'VIP', value: kpis.vipCustomers, color: 'bg-vip-50 text-vip-700 border-vip-200', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', action: () => { onFilterChange('vip'); onTabChange('clients'); } },
    { label: 'Actifs', value: kpis.activeCustomers, color: 'bg-success-50 text-success-700 border-success-200', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', action: () => { onFilterChange('all'); onTabChange('clients'); } },
    { label: 'Inactifs', value: kpis.inactiveCustomers, color: 'bg-gray-50 text-gray-600 border-gray-200', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', action: () => { onFilterChange('inactive'); onTabChange('clients'); } },
    { label: 'Proches recompense', value: kpis.nearReward, color: 'bg-warning-50 text-warning-700 border-warning-200', icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7', action: () => onTabChange('clients') },
    { label: 'Nouveaux', value: kpis.newCustomers, color: 'bg-primary-50 text-primary-700 border-primary-200', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', action: () => { onFilterChange('new'); onTabChange('clients'); } },
  ];

  return (
    <div className="space-y-5 animate-fade-up">
      {/* ═══ A. Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Vue d&apos;ensemble</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {today.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 self-start">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={[
                'px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg transition-all tap-target',
                period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {p === '7d' ? '7j' : p === '30d' ? '30j' : '90j'}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Health Banner ═══ */}
      {!triggersLoading && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${healthStatus.bg}`}>
          <div className="flex items-center gap-2.5">
            <SIcon d={healthStatus.icon} className={`w-4.5 h-4.5 ${healthStatus.text}`} />
            <span className={`text-sm font-semibold ${healthStatus.text}`}>{healthStatus.label}</span>
          </div>
          {growthTriggers.length > 0 && (
            <span className={`text-xs ${healthStatus.text} opacity-70`}>
              {[
                (highRiskCount + medRiskCount) > 0 ? `${highRiskCount + medRiskCount} risque${highRiskCount + medRiskCount > 1 ? 's' : ''}` : '',
                oppCount > 0 ? `${oppCount} opportunite${oppCount > 1 ? 's' : ''}` : '',
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      )}

      {/* ═══ B. KPI Cards ═══ */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total clients */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-medium">Clients totaux</p>
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <SIcon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" className="w-4 h-4 text-primary-600" />
            </div>
          </div>
          {!isPaidPlan ? (() => {
            const limit = 500;
            const pct = Math.min(totalCustomers / limit, 1);
            const size = 72;
            const center = size / 2;
            const radius = 30;
            const circ = 2 * Math.PI * radius;
            const color = pct >= 0.85 ? 'var(--color-danger-600)' : pct >= 0.65 ? 'var(--color-warning-600)' : 'var(--color-primary-600)';
            return (
              <div className="flex items-center gap-3">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
                  <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-gray-100)" strokeWidth="4" />
                  <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth="4"
                    strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
                    transform={`rotate(-90 ${center} ${center})`} className="transition-all duration-500" />
                  <text x={center} y={center} textAnchor="middle" dominantBaseline="central"
                    className="text-base font-bold" fill="var(--color-gray-900)" style={{ fontFamily: 'inherit' }}>
                    {totalCustomers}
                  </text>
                </svg>
                <div>
                  <p className="text-xs text-gray-500">sur {limit}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${pct >= 0.85 ? 'text-danger-600' : pct >= 0.65 ? 'text-warning-600' : 'text-gray-400'}`}>
                    {pct >= 0.85 ? 'Limite bientot atteinte' : `${Math.round(pct * 100)}% utilise`}
                  </p>
                </div>
              </div>
            );
          })() : (
            <>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{totalCustomers.toLocaleString('fr-FR')}</p>
              <p className="text-xs text-gray-400 mt-1">Clients illimites</p>
            </>
          )}
        </div>

        {/* Active this period */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-medium">Actifs</p>
            <div className="w-8 h-8 rounded-lg bg-success-50 flex items-center justify-center">
              <SIcon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 text-success-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{restaurantMetrics?.active_customers_30d ?? kpis.activeThisPeriod}</p>
          <div className="mt-1.5"><TrendBadge value={kpis.trendActive} /></div>
        </div>

        {/* New this period */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-medium">Nouveaux</p>
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <SIcon d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{restaurantMetrics?.new_customers_30d ?? kpis.newCustomers}</p>
          <div className="mt-1.5"><TrendBadge value={kpis.trendNew} /></div>
        </div>

        {/* Return rate */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-medium">Taux de fidelite</p>
            <div className="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center">
              <SIcon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4 text-warning-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {restaurantMetrics?.repeat_rate != null ? `${Number(restaurantMetrics.repeat_rate).toFixed(0)}%` : `${kpis.returnRate}%`}
          </p>
          <p className="text-xs text-gray-400 mt-1">Clients avec 2+ visites</p>
        </div>
      </div>

      {/* ═══ Row 2: 4 secondary KPIs ═══ */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center flex-shrink-0">
            <SIcon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-warning-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{kpis.completedCards}</p>
            <p className="text-xs text-gray-500">Cartes completees</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center flex-shrink-0">
            <SIcon d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" className="w-5 h-5 text-success-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{kpis.rewardsThisPeriod}</p>
            <p className="text-xs text-gray-500">Recompenses</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            <SIcon d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{kpis.visitsThisPeriod}</p>
            <p className="text-xs text-gray-500">Visites / scans</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <SIcon d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            {restaurantMetrics?.estimated_revenue_30d != null ? (
              <p className="text-lg font-bold text-gray-900 tabular-nums">{Number(restaurantMetrics.estimated_revenue_30d).toLocaleString('fr-FR')} &euro;</p>
            ) : (
              <p className="text-lg font-bold text-gray-400">--</p>
            )}
            <p className="text-xs text-gray-500">Revenu estime</p>
          </div>
        </div>
      </div>

      {/* ═══ C. Charts + D. Priority Actions ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 sm:gap-5">
        {/* Activity chart */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
            <h3 className="text-sm font-semibold text-gray-900">Activite — {periodDays} derniers jours</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DS.primary }} />Inscriptions</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DS.purple }} />Visites</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ov-gradClients" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={DS.primary} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={DS.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ov-gradVisits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={DS.purple} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={DS.purple} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.gray100} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(periodDays / 7))} />
              <YAxis tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontSize: '0.8rem', background: 'white' }} cursor={{ stroke: DS.gray200, strokeWidth: 1 }} />
              <Area type="monotone" dataKey="Inscriptions" stroke={DS.primary} strokeWidth={2} fill="url(#ov-gradClients)" dot={false} />
              <Area type="monotone" dataKey="Visites" stroke={DS.purple} strokeWidth={2} fill="url(#ov-gradVisits)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col min-h-[280px]">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Actions prioritaires</h3>
            {triggersLoading
              ? <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-ds-spin" />
              : growthTriggers.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                    {growthTriggers.length}
                  </span>
                )
            }
          </div>
          <div className="flex-1 p-4 flex flex-col gap-2.5 overflow-y-auto max-h-[340px]">
            {!triggersLoading && growthTriggers.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center py-4">
                  <SIcon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-8 h-8 text-success-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-medium">Aucune action requise</p>
                  <p className="text-xs text-gray-300 mt-0.5">Votre programme se porte bien !</p>
                </div>
              </div>
            )}
            {sortedTriggers.slice(0, 6).map((trigger, i) => {
              const accentBorder = trigger.type === 'risk' ? 'border-l-2 border-danger-600' : trigger.type === 'opportunity' ? 'border-l-2 border-primary-600' : 'border-l-2 border-purple-600';
              const cardBg = trigger.type === 'risk' ? 'bg-danger-50' : trigger.type === 'opportunity' ? 'bg-primary-50' : 'bg-purple-50';
              const titleColor = trigger.type === 'risk' ? 'text-danger-700' : trigger.type === 'opportunity' ? 'text-primary-700' : 'text-purple-700';
              const ctaLabel = trigger.type === 'upgrade' ? 'Voir Pro' : trigger.type === 'risk' ? 'Agir' : 'Explorer';
              return (
                <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl ${cardBg} ${accentBorder}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${titleColor} leading-tight`}>{trigger.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{trigger.message}</p>
                  </div>
                  <button onClick={() => handleTriggerCta(trigger)} className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${titleColor} border-current bg-white/70 hover:bg-white transition-colors whitespace-nowrap`}>
                    {ctaLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ E. Customer Segments ═══ */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Segments clients</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {segments.map((seg, i) => (
            <button
              key={i}
              onClick={seg.action}
              className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${seg.color}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <SIcon d={seg.icon} className="w-4 h-4" />
                <span className="text-xs font-semibold">{seg.label}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{seg.value}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Growth chart + Insights ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Weekly growth */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Croissance hebdomadaire</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.gray100} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontSize: '0.8rem', background: 'white' }} />
              <Bar dataKey="Clients" fill={DS.primary} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* F. Auto Insights */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Insights automatiques</h3>
          <div className="flex flex-col gap-2.5">
            {insights.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">Pas assez de donnees pour generer des insights.</p>
            )}
            {insights.map((insight, i) => {
              const colors = insight.type === 'success' ? 'bg-success-50 text-success-700' : insight.type === 'warning' ? 'bg-warning-50 text-warning-700' : 'bg-primary-50 text-primary-700';
              return (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl ${colors}`}>
                  <SIcon d={insight.icon} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-sm leading-relaxed">{insight.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ G. Pro Opportunities ═══ */}
      {!isPaidPlan && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Metriques avancees</h3>
            <Badge variant="info" className="text-[10px]">PRO</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: 'LTV client', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              { label: 'Taux de churn', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' },
              { label: 'Cohortes', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
              { label: 'Segmentation', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
              { label: 'Wallet adoption', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
              { label: 'Perf. campagnes', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-dashed border-gray-200 p-3.5 opacity-50 text-center">
                <SIcon d={item.icon} className="w-5 h-5 text-gray-400 mx-auto mb-2" />
                <p className="text-xs font-medium text-gray-500">{item.label}</p>
                <p className="text-lg font-bold text-gray-300 mt-1">--</p>
              </div>
            ))}
          </div>
          <button onClick={onUpgrade} className="mt-5 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
            Debloquer les metriques Pro
          </button>
        </div>
      )}

      {/* Premium KPIs for paid plans */}
      {isPaidPlan && restaurantMetrics && (
        restaurantMetrics.wallet_active_passes != null ||
        restaurantMetrics.estimated_revenue_30d != null ||
        restaurantMetrics.completed_cards != null
      ) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Metriques avancees · {periodDays}j</h3>
            <Badge variant="info" className="text-[10px]">PRO</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {restaurantMetrics.wallet_active_passes != null && (
              <div className="bg-gray-50 rounded-xl p-3.5">
                <p className="text-xl font-bold text-gray-900 tabular-nums">{restaurantMetrics.wallet_active_passes}</p>
                <p className="text-xs text-gray-500 mt-0.5">Wallet actifs</p>
              </div>
            )}
            {restaurantMetrics.estimated_revenue_30d != null && (
              <div className="bg-gray-50 rounded-xl p-3.5">
                <p className="text-xl font-bold text-gray-900 tabular-nums">{Number(restaurantMetrics.estimated_revenue_30d).toLocaleString('fr-FR')} &euro;</p>
                <p className="text-xs text-gray-500 mt-0.5">Revenu estime</p>
              </div>
            )}
            {restaurantMetrics.completed_cards != null && (
              <div className="bg-gray-50 rounded-xl p-3.5">
                <p className="text-xl font-bold text-gray-900 tabular-nums">{restaurantMetrics.completed_cards}</p>
                <p className="text-xs text-gray-500 mt-0.5">Cartes completees</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
