'use client';
import { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { useTranslation } from '@/lib/i18n';

/* ─── Design tokens ─ */
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

const PIE_COLORS = ['#4F6BED', '#10b981', '#f59e0b', '#6366f1', '#ef4444'];

/* ─── Types ─────────────────────────────────────────────── */
interface Customer {
  id: string;
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
  vip_threshold_points: number;
  vip_threshold_stamps: number;
}

interface Props {
  customers: Customer[];
  transactions: Transaction[];
  restaurantMetrics: RestaurantMetrics | null | undefined;
  loyaltySettings: LoyaltySettings;
  isPaidPlan: boolean;
  restaurantSettings: Record<string, string>;
  onUpgrade: () => void;
}

type Period = '7d' | '30d' | '90d';

/* ─── Helpers ─────────────────────────────────────────── */
const MS_DAY = 86400000;

function getCustomerStatus(
  c: Customer,
  programType: 'points' | 'stamps',
  vipThreshold: number,
  now: number,
): 'vip' | 'active' | 'inactive' | 'new' {
  if ((now - new Date(c.created_at).getTime()) < 30 * MS_DAY) return 'new';
  if (!c.last_visit_at) return 'inactive';
  const days = (now - new Date(c.last_visit_at).getTime()) / MS_DAY;
  if (days > 30) return 'inactive';
  if (programType === 'stamps') {
    if ((c.stamps_count ?? 0) >= vipThreshold) return 'vip';
  } else {
    if (c.total_points >= vipThreshold) return 'vip';
  }
  return 'active';
}

function SIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ─── Main component ────────────────────────────────────── */
export default function AnalyticsTab({
  customers,
  transactions,
  restaurantMetrics,
  loyaltySettings,
  isPaidPlan,
  restaurantSettings,
  onUpgrade,
}: Props) {
  const { t, locale } = useTranslation();
  const [period, setPeriod] = useState<Period>('30d');
  const NOW = Date.now();
  const totalCustomers = customers.length;
  const periodMs = period === '7d' ? 7 * MS_DAY : period === '30d' ? 30 * MS_DAY : 90 * MS_DAY;
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const periodLabel = period === '7d' ? t('analytics.period7dFull') : period === '30d' ? t('analytics.period30dFull') : t('analytics.period90dFull');

  /* ── Computed KPIs ── */
  const kpis = useMemo(() => {
    const activeCustomers = customers.filter(c => c.last_visit_at && (NOW - new Date(c.last_visit_at).getTime()) < periodMs).length;
    const inactiveCustomers = customers.filter(c => !c.last_visit_at || (NOW - new Date(c.last_visit_at).getTime()) > 45 * MS_DAY).length;
    const newCustomers = customers.filter(c => (NOW - new Date(c.created_at).getTime()) < periodMs).length;
    // Return rate: customers who visited more than once within the period
    const visitsByCustomer = new Map<string, number>();
    transactions.filter(tx => tx.type === 'visit' && (NOW - new Date(tx.created_at).getTime()) < periodMs)
      .forEach(tx => visitsByCustomer.set(tx.customer_id, (visitsByCustomer.get(tx.customer_id) ?? 0) + 1));
    const customersWithVisits = visitsByCustomer.size;
    const returningCustomers = [...visitsByCustomer.values()].filter(v => v > 1).length;
    const returnRate = customersWithVisits > 0 ? Math.round((returningCustomers / customersWithVisits) * 100) : 0;

    const visitsThisPeriod = transactions.filter(t => t.type === 'visit' && (NOW - new Date(t.created_at).getTime()) < periodMs).length;
    const rewardsEarned = transactions.filter(t => t.type === 'reward_redeem' && (NOW - new Date(t.created_at).getTime()) < periodMs).length;
    const completedCards = customers.reduce((sum, c) => sum + (c.completed_cards ?? 0), 0);

    const vipThreshold = loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points;
    const vipCustomers = customers.filter(c => getCustomerStatus(c, loyaltySettings.program_type, vipThreshold, NOW) === 'vip').length;
    const nearThreshold = loyaltySettings.program_type === 'stamps'
      ? Math.max(1, loyaltySettings.stamps_total - 2)
      : loyaltySettings.reward_threshold * 0.8;
    const nearReward = loyaltySettings.program_type === 'stamps'
      ? customers.filter(c => (c.stamps_count ?? 0) >= nearThreshold && (c.stamps_count ?? 0) < loyaltySettings.stamps_total).length
      : customers.filter(c => c.total_points >= nearThreshold && c.total_points < loyaltySettings.reward_threshold).length;

    // Average ticket
    const avgTicket = parseFloat(restaurantSettings['average_ticket'] || '0');
    const estimatedRevenue = avgTicket > 0 ? visitsThisPeriod * avgTicket : null;

    // Reward cost
    const avgRewardCost = parseFloat(restaurantSettings['average_reward_cost'] || '0');
    const estimatedRewardCost = avgRewardCost > 0 ? rewardsEarned * avgRewardCost : null;

    // Average visits per customer
    const avgVisits = totalCustomers > 0 ? (customers.reduce((sum, c) => sum + c.total_visits, 0) / totalCustomers).toFixed(1) : '0';

    // Avg time to complete a card (estimate: customers with completed_cards > 0)
    const completedCustomers = customers.filter(c => (c.completed_cards ?? 0) > 0);
    let avgCardDays: number | null = null;
    if (completedCustomers.length > 0 && loyaltySettings.program_type === 'stamps') {
      const totalDaysActive = completedCustomers.reduce((sum, c) => {
        const firstVisit = new Date(c.created_at).getTime();
        const lastVisit = c.last_visit_at ? new Date(c.last_visit_at).getTime() : NOW;
        return sum + (lastVisit - firstVisit) / MS_DAY;
      }, 0);
      const totalCards = completedCustomers.reduce((s, c) => s + (c.completed_cards ?? 0), 0);
      avgCardDays = totalCards > 0 ? Math.round(totalDaysActive / totalCards) : null;
    }

    // Reward utilization rate
    const totalRewardsEver = transactions.filter(t => t.type === 'reward_redeem').length;
    const rewardUtilRate = completedCards > 0 ? Math.round((totalRewardsEver / completedCards) * 100) : null;

    return {
      activeCustomers,
      inactiveCustomers,
      newCustomers,
      returnRate,
      visitsThisPeriod,
      rewardsEarned,
      completedCards,
      vipCustomers,
      nearReward,
      estimatedRevenue,
      avgTicket,
      avgVisits,
      avgCardDays,
      rewardUtilRate,
      avgRewardCost,
      estimatedRewardCost,
    };
  }, [customers, transactions, totalCustomers, periodMs, loyaltySettings, restaurantSettings]);

  /* ── Distribution data ── */
  const distribution = useMemo(() => {
    const vipThreshold = loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points;
    const statusCounts = { active: 0, inactive: 0, vip: 0, new: 0, nearReward: 0 };
    customers.forEach(c => {
      const s = getCustomerStatus(c, loyaltySettings.program_type, vipThreshold, NOW);
      statusCounts[s]++;
    });
    statusCounts.nearReward = kpis.nearReward;
    return [
      { name: t('analytics.activeClients'), value: statusCounts.active, color: PIE_COLORS[1] },
      { name: t('common.inactive'), value: statusCounts.inactive, color: PIE_COLORS[4] },
      { name: 'VIP', value: statusCounts.vip, color: PIE_COLORS[2] },
      { name: t('analytics.newClients'), value: statusCounts.new, color: PIE_COLORS[0] },
    ].filter(d => d.value > 0);
  }, [customers, kpis.nearReward, loyaltySettings, t]);

  /* ── Monthly growth chart ── */
  const monthlyGrowth = useMemo(() => {
    const months: { month: string; [key: string]: number | string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = monthStart.toLocaleDateString(locale, { month: 'short' });

      const newCount = customers.filter(c => {
        const cd = new Date(c.created_at);
        return cd >= monthStart && cd <= monthEnd;
      }).length;

      const recurring = new Set(
        transactions.filter(tx => {
          const td = new Date(tx.created_at);
          return td >= monthStart && td <= monthEnd && tx.type === 'visit';
        }).map(tx => tx.customer_id)
      ).size;

      months.push({ month: label, [t('analytics.newLabel')]: newCount, [t('analytics.recurringLabel')]: recurring });
    }
    return months;
  }, [customers, transactions, locale, t]);

  /* ── Daily activity ── */
  const dailyActivity = useMemo(() => {
    return Array.from({ length: periodDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (periodDays - 1 - i));
      const dayStr = d.toISOString().split('T')[0];
      return {
        date: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
        [t('analytics.visitsLabel')]: transactions.filter(tx => tx.created_at.startsWith(dayStr) && tx.type === 'visit').length,
        [t('analytics.registrationsLabel')]: customers.filter(c => c.created_at.startsWith(dayStr)).length,
      };
    });
  }, [customers, transactions, periodDays, locale, t]);

  /* ── Auto insights ── */
  const insights = useMemo(() => {
    const list: { text: string; type: 'success' | 'warning' | 'info' | 'danger'; icon: string }[] = [];

    if (kpis.returnRate > 60) list.push({ text: t('analytics.insightGoodReturn', { rate: kpis.returnRate }), type: 'success', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' });
    else if (kpis.returnRate < 30 && totalCustomers > 5) list.push({ text: t('analytics.insightLowReturn', { rate: kpis.returnRate }), type: 'danger', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' });

    if (kpis.rewardUtilRate !== null && kpis.rewardUtilRate < 50) list.push({ text: t('analytics.insightLowRewardUtil', { rate: kpis.rewardUtilRate }), type: 'warning', icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7' });
    else if (kpis.rewardUtilRate !== null && kpis.rewardUtilRate > 80) list.push({ text: t('analytics.insightGoodRewardUtil', { rate: kpis.rewardUtilRate }), type: 'success', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' });

    if (kpis.inactiveCustomers > totalCustomers * 0.4) list.push({ text: t('analytics.insightInactiveClients', { count: kpis.inactiveCustomers }), type: 'warning', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' });

    if (kpis.nearReward > 0) list.push({ text: t('analytics.insightNearReward', { count: kpis.nearReward }), type: 'info', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' });

    if (kpis.avgCardDays !== null && kpis.avgCardDays > 60) list.push({ text: t('analytics.insightSlowCards', { days: kpis.avgCardDays }), type: 'info', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' });

    if (kpis.newCustomers > 0) list.push({ text: t('analytics.insightNewClients', { count: kpis.newCustomers }), type: 'success', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' });

    return list;
  }, [kpis, totalCustomers, t]);

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{t('analytics.title')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('analytics.subtitle')}
            {restaurantMetrics?.last_computed_at && (
              <span className="text-gray-400"> · {t('analytics.lastUpdate')} {new Date(restaurantMetrics.last_computed_at).toLocaleDateString(locale)}</span>
            )}
          </p>
        </div>
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
              {p === '7d' ? t('analytics.period7d') : p === '30d' ? t('analytics.period30d') : t('analytics.period90d')}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ A. KPI Grid ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          { label: t('analytics.totalClients'), value: totalCustomers.toLocaleString(locale), icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', bg: 'bg-primary-50', iconColor: 'text-primary-600' },
          { label: t('analytics.activeClients'), value: kpis.activeCustomers.toString(), icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', bg: 'bg-success-50', iconColor: 'text-success-600' },
          { label: t('analytics.newClients'), value: kpis.newCustomers.toString(), icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', bg: 'bg-purple-50', iconColor: 'text-purple-600' },
          { label: t('analytics.returnRate'), value: `${kpis.returnRate}%`, icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', bg: 'bg-warning-50', iconColor: 'text-warning-600' },
          { label: t('analytics.visitsScans'), value: kpis.visitsThisPeriod.toLocaleString(locale), icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', bg: 'bg-gray-50', iconColor: 'text-gray-600' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
              <div className={`w-7 h-7 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <SIcon d={kpi.icon} className={`w-3.5 h-3.5 ${kpi.iconColor}`} />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900 tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Row 2: secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: t('analytics.completedCards'), value: kpis.completedCards.toString() },
          { label: t('analytics.rewards'), value: kpis.rewardsEarned.toString() },
          { label: t('analytics.avgVisitsPerClient'), value: kpis.avgVisits },
          { label: t('analytics.estimatedRevenue'), value: kpis.estimatedRevenue && kpis.estimatedRevenue > 0 ? `${kpis.estimatedRevenue.toLocaleString(locale)} \u20AC` : '--' },
          { label: t('analytics.averageBasket'), value: kpis.avgTicket > 0 ? `${kpis.avgTicket.toFixed(2)} \u20AC` : '--' },
          { label: t('analytics.rewardCost'), value: kpis.estimatedRewardCost && kpis.estimatedRewardCost > 0 ? `${kpis.estimatedRewardCost.toLocaleString(locale)} \u20AC` : '--' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-xs text-gray-500 font-medium mb-1">{kpi.label}</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ═══ B. Distribution + D. Loyalty Performance ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pie chart: client distribution */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('analytics.clientDistribution')}</h3>
          {distribution.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" /></svg>
              </div>
              <p className="text-sm text-gray-400">{t('analytics.notEnoughData')}</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <ResponsiveContainer width="100%" height={160} className="sm:!w-1/2">
                <PieChart>
                  <Pie data={distribution} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
                    {distribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full sm:flex-1 space-y-3">
                {distribution.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-sm text-gray-600 flex-1">{d.name}</span>
                    <span className="text-sm font-bold text-gray-900 tabular-nums">{d.value}</span>
                    <span className="text-xs text-gray-400 w-10 text-right tabular-nums">
                      {totalCustomers > 0 ? `${Math.round((d.value / totalCustomers) * 100)}%` : '0%'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Loyalty performance */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('analytics.performanceTitle')}</h3>
          <div className="space-y-4">
            {[
              { label: t('analytics.completedCardsTotal'), value: kpis.completedCards, suffix: '' },
              { label: t('analytics.rewardsPeriod'), value: kpis.rewardsEarned, suffix: '' },
              { label: t('analytics.nearReward'), value: kpis.nearReward, suffix: '' },
              { label: t('analytics.avgCardCompletion'), value: kpis.avgCardDays ?? '--', suffix: kpis.avgCardDays ? ` ${t('common.days')}` : '' },
              { label: t('analytics.rewardUtilRate'), value: kpis.rewardUtilRate ?? '--', suffix: kpis.rewardUtilRate !== null ? '%' : '' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{item.label}</span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">{item.value}{item.suffix}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ C. Growth charts ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly growth */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('analytics.monthlyGrowth')}</h3>
          <p className="text-xs text-gray-400 mb-4">{t('analytics.monthlyGrowthSubtitle')}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyGrowth} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.gray100} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontSize: '0.8rem', background: 'white' }} />
              <Bar dataKey={t('analytics.newLabel')} fill={DS.primary} radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('analytics.recurringLabel')} fill={DS.purple} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-6 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DS.primary }} />{t('analytics.newLabel')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DS.purple }} />{t('analytics.recurringLabel')}</span>
          </div>
        </div>

        {/* Daily activity */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('analytics.dailyActivity')}</h3>
          <p className="text-xs text-gray-400 mb-4">{periodLabel}</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyActivity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="an-gradVisits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={DS.success} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={DS.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.gray100} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(periodDays / 7))} />
              <YAxis tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontSize: '0.8rem', background: 'white' }} />
              <Area type="monotone" dataKey={t('analytics.visitsLabel')} stroke={DS.success} strokeWidth={2} fill="url(#an-gradVisits)" dot={false} />
              <Area type="monotone" dataKey={t('analytics.registrationsLabel')} stroke={DS.primary} strokeWidth={2} fill="none" dot={false} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-6 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DS.success }} />{t('analytics.visitsLabel')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 border-b-2 border-dashed" style={{ borderColor: DS.primary }} />{t('analytics.registrationsLabel')}</span>
          </div>
        </div>
      </div>

      {/* ═══ E. Auto Insights ═══ */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('analytics.insightsTitle')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {insights.length === 0 && (
            <div className="flex items-center gap-3 col-span-2 py-2">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
              </div>
              <p className="text-sm text-gray-400">{t('analytics.insightsNoData')}</p>
            </div>
          )}
          {insights.map((insight, i) => {
            const colorMap = {
              success: 'bg-success-50 text-success-700 border-success-200',
              warning: 'bg-warning-50 text-warning-700 border-warning-200',
              info:    'bg-primary-50 text-primary-700 border-primary-200',
              danger:  'bg-danger-50 text-danger-700 border-danger-200',
            };
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border ${colorMap[insight.type]}`}>
                <SIcon d={insight.icon} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm leading-relaxed">{insight.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ F. Pro Zone ═══ */}
      {!isPaidPlan && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('analytics.proTitle')}</h3>
            <Badge variant="info" className="text-[10px]">{t('analytics.proTag')}</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: t('analytics.proLtv') },
              { label: t('analytics.proChurn') },
              { label: t('analytics.proCohorts') },
              { label: t('analytics.proCampaignPerf') },
              { label: t('analytics.proWalletAdoption') },
              { label: t('analytics.proMultiSite') },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-dashed border-gray-200 p-3.5 opacity-50 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">{item.label}</p>
                <p className="text-lg font-bold text-gray-300 tabular-nums">--</p>
              </div>
            ))}
          </div>
          <button onClick={onUpgrade} className="mt-5 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
            {t('analytics.proUnlock')}
          </button>
        </div>
      )}
    </div>
  );
}
