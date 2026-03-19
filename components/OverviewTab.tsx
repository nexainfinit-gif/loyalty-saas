'use client';
import { useMemo, useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from '@/lib/i18n';

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
  vip_threshold_points: number;
  vip_threshold_stamps: number;
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
  referralEnabled?: boolean;
}

type Period = '7d' | '30d' | '90d';

/* ─── Helpers ───────────────────────────────────────────── */
const MS_DAY = 86400000;

function trendPct(a: number, b: number): number | null {
  if (b === 0) return a > 0 ? 100 : null;
  return Math.round(((a - b) / b) * 100);
}

/** Clamp a number between min and max. */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/* Minimal SVG icon component — inline paths, zero deps */
function I({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ─── Icon paths ───────────────────────────────────────── */
const ICONS = {
  users:      'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  userPlus:   'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  refresh:    'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  gift:       'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  check:      'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warning:    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  info:       'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  trendUp:    'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  star:       'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  clock:      'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  cake:       'M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0A1.75 1.75 0 003 17.25v.763c0 .414.336.75.75.75h16.5a.75.75 0 00.75-.75v-.764a1.75 1.75 0 00-.75-1.703zM4.5 6.75a.75.75 0 01.75-.75h13.5a.75.75 0 01.75.75v7.5H4.5v-7.5z',
  arrowRight: 'M14 5l7 7m0 0l-7 7m7-7H3',
  mail:       'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  bolt:       'M13 10V3L4 14h7v7l9-11h-7z',
} as const;

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
  referralEnabled,
}: Props) {
  const { t, locale } = useTranslation();
  const [period, setPeriod] = useState<Period>('30d');
  const today = new Date();
  const NOW = today.getTime();

  const periodMs = period === '7d' ? 7 * MS_DAY : period === '30d' ? 30 * MS_DAY : 90 * MS_DAY;
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const activeCustomers = customers.filter(c => c.last_visit_at && (NOW - new Date(c.last_visit_at).getTime()) < periodMs).length;
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

    // Return rate: customers who visited more than once within the period
    const visitsByCustomer = new Map<string, number>();
    transactions.filter(tx => tx.type === 'visit' && (NOW - new Date(tx.created_at).getTime()) < periodMs)
      .forEach(tx => visitsByCustomer.set(tx.customer_id, (visitsByCustomer.get(tx.customer_id) ?? 0) + 1));
    const customersWithVisits = visitsByCustomer.size;
    const returningCustomers = [...visitsByCustomer.values()].filter(v => v > 1).length;
    const returnRate = customersWithVisits > 0 ? Math.round((returningCustomers / customersWithVisits) * 100) : 0;

    const rewardsThisPeriod = transactions.filter(t => t.type === 'reward_redeem' && (NOW - new Date(t.created_at).getTime()) < periodMs).length;
    const rewardsPrevPeriod = transactions.filter(t => {
      const age = NOW - new Date(t.created_at).getTime();
      return t.type === 'reward_redeem' && age >= periodMs && age < 2 * periodMs;
    }).length;

    const vipThreshold = loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points;
    const vipCustomers = customers.filter(c => {
      if (!c.last_visit_at) return false;
      const days = (NOW - new Date(c.last_visit_at).getTime()) / MS_DAY;
      if (days > 30) return false;
      return loyaltySettings.program_type === 'stamps'
        ? (c.stamps_count ?? 0) >= vipThreshold
        : c.total_points >= vipThreshold;
    }).length;

    const inactiveCustomers = customers.filter(c => !c.last_visit_at || (NOW - new Date(c.last_visit_at).getTime()) > 45 * MS_DAY).length;

    const nearThreshold = loyaltySettings.program_type === 'stamps'
      ? Math.max(1, loyaltySettings.stamps_total - 2)
      : loyaltySettings.reward_threshold * 0.8;
    const nearReward = loyaltySettings.program_type === 'stamps'
      ? customers.filter(c => (c.stamps_count ?? 0) >= nearThreshold && (c.stamps_count ?? 0) < loyaltySettings.stamps_total).length
      : customers.filter(c => c.total_points >= nearThreshold && c.total_points < loyaltySettings.reward_threshold).length;

    const in7days = new Date(); in7days.setDate(today.getDate() + 7);
    const birthdaysSoon = customers.filter(c => {
      if (!c.birth_date) return false;
      const b = new Date(c.birth_date);
      const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
      return next >= today && next <= in7days;
    }).length;

    return {
      activeCustomers,
      newCustomers,
      prevNewCustomers,
      activeThisPeriod,
      activePrevPeriod,
      returnRate,
      rewardsThisPeriod,
      rewardsPrevPeriod,
      vipCustomers,
      inactiveCustomers,
      nearReward,
      birthdaysSoon,
      trendNew: trendPct(newCustomers, prevNewCustomers),
      trendActive: trendPct(activeThisPeriod, activePrevPeriod),
      trendRewards: trendPct(rewardsThisPeriod, rewardsPrevPeriod),
    };
  }, [customers, transactions, totalCustomers, periodMs, loyaltySettings, NOW]);

  /* ── Chart data ── */
  const chartData = useMemo(() => {
    return Array.from({ length: periodDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (periodDays - 1 - i));
      const dayStr = d.toISOString().split('T')[0];
      return {
        date: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
        [t('overview.visitsLabel')]: transactions.filter(tx => tx.created_at.startsWith(dayStr) && tx.type === 'visit').length,
      };
    });
  }, [transactions, periodDays, locale, t]);

  /* ══════════════════════════════════════════════════════════
     FEATURE 1: PROGRAM SCORE (0–100)
     ──────────────────────────────────────────────────────── */
  const programScore = useMemo(() => {
    if (totalCustomers === 0) return { score: 0, label: t('overview.noData'), color: 'text-gray-400' as const };

    // A. Activity ratio (0–30 pts) — use same source as KPI card
    const activeRatio = totalCustomers > 0
      ? kpis.activeThisPeriod / totalCustomers
      : 0;
    const activityScore = clamp(Math.round(activeRatio * 100 * 0.3), 0, 30);

    // B. Return rate (0–30 pts)
    const returnScore = clamp(Math.round(kpis.returnRate * 0.3), 0, 30);

    // C. Rewards engagement (0–20 pts)
    const rewardRatio = totalCustomers > 0 ? kpis.rewardsThisPeriod / totalCustomers : 0;
    const rewardScore = clamp(Math.round(Math.min(rewardRatio * 10, 1) * 20), 0, 20);

    // D. Growth trend (0–20 pts)
    const growthTrend = kpis.trendNew ?? 0;
    const growthScore = clamp(Math.round(((growthTrend + 50) / 100) * 20), 0, 20);

    const total = clamp(activityScore + returnScore + rewardScore + growthScore, 0, 100);

    const label = total >= 75 ? t('overview.healthExcellent')
      : total >= 55 ? t('overview.healthGood')
      : total >= 35 ? t('overview.healthImprove')
      : t('overview.healthLow');

    const color = total >= 75 ? 'text-success-700' as const
      : total >= 55 ? 'text-primary-700' as const
      : total >= 35 ? 'text-warning-700' as const
      : 'text-danger-700' as const;

    return { score: total, label, color };
  }, [totalCustomers, kpis, t]);

  /* Score ring colors */
  const scoreRingColor = programScore.score >= 75 ? 'var(--color-success-600)'
    : programScore.score >= 55 ? 'var(--color-primary-600)'
    : programScore.score >= 35 ? 'var(--color-warning-600)'
    : 'var(--color-danger-600)';

  /* ── Health status ── */
  const highRiskCount = growthTriggers.filter(t => t.type === 'risk' && t.severity === 'high').length;
  const medRiskCount = growthTriggers.filter(t => t.type === 'risk' && t.severity === 'medium').length;

  type Health = 'healthy' | 'watch' | 'attention';
  const health: Health = highRiskCount > 0 ? 'attention' : medRiskCount > 0 ? 'watch' : 'healthy';

  const healthConfig = {
    healthy:   { label: t('overview.programHealthy'), bg: 'bg-success-50', text: 'text-success-700', dot: 'bg-success-500' },
    watch:     { label: t('overview.programWatch'),   bg: 'bg-warning-50', text: 'text-warning-700', dot: 'bg-warning-500' },
    attention: { label: t('overview.programAttention'), bg: 'bg-danger-50',  text: 'text-danger-700',  dot: 'bg-danger-500' },
  } as const;

  const hc = healthConfig[health];


  /* ══════════════════════════════════════════════════════════
     FEATURE 3: SMART ACTION SHORTCUTS (max 3)
     ──────────────────────────────────────────────────────── */
  const actions = useMemo(() => {
    const list: { icon: string; text: string; cta: string; onClick: () => void; accent: string; bg: string; _triggerKey?: string }[] = [];

    if (kpis.nearReward > 0) {
      list.push({
        icon: ICONS.gift,
        text: t('overview.nearRewardAlert', { count: kpis.nearReward }),
        cta: t('overview.sendReminder'),
        onClick: onCampaignOpen,
        accent: 'text-warning-700',
        bg: 'bg-warning-50',
      });
    }

    if (kpis.birthdaysSoon > 0 && list.length < 3) {
      list.push({
        icon: ICONS.cake,
        text: t('overview.birthdayAlert', { count: kpis.birthdaysSoon }),
        cta: t('overview.launchCampaign'),
        onClick: onCampaignOpen,
        accent: 'text-primary-700',
        bg: 'bg-primary-50',
      });
    }

    if (kpis.inactiveCustomers > 5 && list.length < 3) {
      list.push({
        icon: ICONS.clock,
        text: t('overview.inactiveAlert', { count: kpis.inactiveCustomers }),
        cta: t('overview.reengage'),
        onClick: () => { onFilterChange('inactive'); onTabChange('campaigns'); },
        accent: 'text-danger-700',
        bg: 'bg-danger-50',
      });
    }

    if (kpis.rewardsThisPeriod === 0 && totalCustomers > 5 && list.length < 3) {
      list.push({
        icon: ICONS.gift,
        text: t('overview.noRewardsTriggered'),
        cta: t('overview.checkThresholds'),
        onClick: () => onTabChange('loyalty'),
        accent: 'text-warning-700',
        bg: 'bg-warning-50',
      });
    }

    if (kpis.newCustomers === 0 && totalCustomers > 0 && list.length < 3) {
      list.push({
        icon: ICONS.userPlus,
        text: t('overview.noNewClients'),
        cta: t('overview.copyLink'),
        onClick: () => {
          if (restaurantSlug) navigator.clipboard?.writeText?.(`${window.location.origin}/register/${restaurantSlug}`);
        },
        accent: 'text-primary-700',
        bg: 'bg-primary-50',
      });
    }

    // Fill from growth triggers if needed
    const triggerActions = growthTriggers
      .filter(t => t.type !== 'upgrade')
      .sort((a, b) => (a.severity === 'high' ? 0 : a.severity === 'medium' ? 1 : 2) - (b.severity === 'high' ? 0 : b.severity === 'medium' ? 1 : 2));

    for (const tr of triggerActions) {
      if (list.length >= 3) break;
      const coveredKeys = new Set(list.map(a => a._triggerKey).filter(Boolean));
      if ((coveredKeys.has('churn_risk_high') || coveredKeys.has('inactive_majority')) && tr.key.includes('churn')) continue;
      if (coveredKeys.has('no_rewards_issued') && tr.key.includes('reward')) continue;
      if (coveredKeys.has('growth_stalled') && tr.key.includes('growth')) continue;
      list.push({
        icon: tr.type === 'risk' ? ICONS.warning : ICONS.trendUp,
        text: t(`triggers.${tr.key}`) !== `triggers.${tr.key}` ? t(`triggers.${tr.key}`) : tr.title,
        _triggerKey: tr.key,
        cta: tr.type === 'risk' ? t('overview.actionBtn') : t('overview.exploreBtn'),
        onClick: () => {
          if (tr.key.includes('campaign') || tr.key.includes('churn') || tr.key.includes('engagement') || tr.key.includes('re_')) onTabChange('campaigns');
          else if (tr.key.includes('reward') || tr.key.includes('no_rewards')) onTabChange('loyalty');
          else onTabChange('clients');
        },
        accent: tr.type === 'risk' ? 'text-danger-700' : 'text-primary-700',
        bg: tr.type === 'risk' ? 'bg-danger-50' : 'bg-primary-50',
      });
    }

    return list.slice(0, 3);
  }, [kpis, totalCustomers, growthTriggers, restaurantSlug, onTabChange, onFilterChange, onCampaignOpen, t]);

  /* ── Segments ── */
  const segments = [
    {
      label: t('overview.segmentVip'),
      value: kpis.vipCustomers,
      bg: 'bg-vip-50',
      text: 'text-vip-700',
      onClick: () => { onFilterChange('vip'); onTabChange('clients'); },
    },
    {
      label: t('overview.segmentNearReward'),
      value: kpis.nearReward,
      bg: 'bg-warning-50',
      text: 'text-warning-700',
      onClick: () => onTabChange('clients'),
    },
    {
      label: t('overview.segmentInactive'),
      value: kpis.inactiveCustomers,
      bg: 'bg-gray-50',
      text: 'text-gray-600',
      onClick: () => { onFilterChange('inactive'); onTabChange('clients'); },
    },
  ];

  /* ── Period label ── */
  const periodLabel = period === '7d' ? t('analytics.period7dFull') : period === '30d' ? t('analytics.period30dFull') : t('analytics.period90dFull');

  return (
    <div className="space-y-6 animate-fade-up">

      {/* ═══ A. HEADER ═══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{t('overview.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">
            {today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            <span className="mx-1.5 text-gray-200">&middot;</span>
            {periodLabel}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1">
            {(['7d', '30d', '90d'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={[
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                {p === '7d' ? t('analytics.period7d') : p === '30d' ? t('analytics.period30d') : t('analytics.period90d')}
              </button>
            ))}
          </div>

          <button
            onClick={onCampaignOpen}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <I d={ICONS.mail} className="w-3.5 h-3.5" />
            {t('overview.campaignLabel')}
          </button>
        </div>
      </div>

      {/* ═══ B. HEALTH STATUS (compact) ═══════════════════════ */}
      {!triggersLoading && (
        <div className={`${hc.bg} rounded-2xl px-5 py-3 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${hc.dot}`} />
            <span className={`text-sm font-semibold ${hc.text}`}>{hc.label}</span>
          </div>
          {totalCustomers > 0 && (
            <div className="flex items-center gap-2.5">
              <ScoreRing score={programScore.score} color={scoreRingColor} size={36} />
              <span className={`text-xs font-semibold ${programScore.color}`}>{programScore.label}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ C. 4 KPI CARDS ══════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t('overview.kpiActiveClients')}
          value={kpis.activeThisPeriod}
          trend={kpis.trendActive}
          icon={ICONS.users}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
        />
        <KpiCard
          label={t('overview.kpiNewClients')}
          value={kpis.newCustomers}
          trend={kpis.trendNew}
          icon={ICONS.userPlus}
          iconBg="bg-success-50"
          iconColor="text-success-600"
        />
        <KpiCard
          label={t('overview.kpiLoyaltyRate')}
          value={`${kpis.returnRate}%`}
          icon={ICONS.refresh}
          iconBg="bg-warning-50"
          iconColor="text-warning-600"
          sub={t('overview.kpiTwoPlus')}
        />
        <KpiCard
          label={t('overview.kpiRewards')}
          value={kpis.rewardsThisPeriod}
          trend={kpis.trendRewards}
          icon={ICONS.gift}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>

      {/* ═══ D. ACTIVITY + SMART ACTIONS ═════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Activity chart — 3 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">{t('overview.activityTitle')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ovGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary-600)" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="var(--color-primary-600)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-gray-400)' }}
                tickLine={false}
                axisLine={false}
                interval={Math.max(1, Math.floor(periodDays / 6))}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                  fontSize: '0.8rem',
                  background: 'white',
                }}
                cursor={{ stroke: 'var(--color-gray-200)', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey={t('overview.visitsLabel')}
                stroke="var(--color-primary-600)"
                strokeWidth={2}
                fill="url(#ovGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Smart action shortcuts — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <I d={ICONS.bolt} className="w-3.5 h-3.5 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">{t('overview.priorityActions')}</h3>
          </div>
          <div className="flex-1 p-4 flex flex-col gap-2.5">
            {triggersLoading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!triggersLoading && actions.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center py-4">
                  <I d={ICONS.check} className="w-8 h-8 text-success-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-medium">{t('overview.nothingToDo')}</p>
                  <p className="text-xs text-gray-300 mt-0.5">{t('overview.programHealthy')}</p>
                </div>
              </div>
            )}
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className={`flex items-center gap-3 p-3.5 rounded-xl ${action.bg} hover:brightness-[0.97] transition-all text-left group`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0">
                  <I d={action.icon} className={`w-4 h-4 ${action.accent}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 leading-snug font-medium">{action.text}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${action.accent}`}>
                    {action.cta}
                    <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ E. SEGMENTS COMPACT ═════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('overview.segmentsToWatch')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {segments.map((seg, i) => (
            <button
              key={i}
              onClick={seg.onClick}
              className={`${seg.bg} rounded-xl px-4 py-3 text-left transition-all hover:ring-1 hover:ring-gray-200`}
            >
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{seg.value}</p>
              <p className={`text-xs font-medium mt-0.5 ${seg.text}`}>{seg.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ F. REFERRAL INSIGHT (conditional) ═════════════════════ */}
      {referralEnabled && <ReferralInsight t={t} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════ */

/* ─── Score Ring ─────────────────────────────────────────── */
function ScoreRing({ score, color, size: sizeProp }: { score: number; color: string; size?: number }) {
  const size = sizeProp ?? 64;
  const strokeWidth = 5;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={center} cy={center} r={radius}
        fill="none" stroke="white" strokeWidth={strokeWidth}
        opacity={0.5}
      />
      <circle
        cx={center} cy={center} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        className="transition-all duration-700 ease-out"
      />
      <text
        x={center} y={center}
        textAnchor="middle" dominantBaseline="central"
        className="text-base font-bold"
        fill="var(--color-gray-900)"
        style={{ fontFamily: 'inherit' }}
      >
        {score}
      </text>
    </svg>
  );
}

/* ─── KPI Card ───────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  trend,
  icon,
  iconBg,
  iconColor,
  sub,
}: {
  label: string;
  value: number | string;
  trend?: number | null;
  icon: string;
  iconBg: string;
  iconColor: string;
  sub?: string;
}) {
  const { locale } = useTranslation();
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <I d={icon} className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 tabular-nums tracking-tight">
        {typeof value === 'number' ? value.toLocaleString(locale) : value}
      </p>
      <div className="mt-1.5 h-5 flex items-center">
        {trend !== undefined && trend !== null ? (
          <TrendBadge value={trend} />
        ) : sub ? (
          <span className="text-xs text-gray-400">{sub}</span>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Trend Badge ────────────────────────────────────────── */
function TrendBadge({ value }: { value: number }) {
  if (value >= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-700 bg-success-50 px-2 py-0.5 rounded-full">
        +{value}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-700 bg-danger-50 px-2 py-0.5 rounded-full">
      {value}%
    </span>
  );
}

/* ─── Referral Insight Card (self-contained / modular) ──── */
function ReferralInsight({ t }: { t: (key: string, params?: Record<string, string | number>) => string }) {
  const [stats, setStats] = useState<{ thisMonth: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/referral/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        setStats({ thisMonth: data.thisPeriod ?? 0, total: data.total ?? 0 });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!stats || (stats.thisMonth === 0 && stats.total === 0)) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-4.5 h-4.5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{t('referral.statsTitle')}</p>
          <p className="text-xs text-gray-500">
            {t('referral.statsThisMonth', { count: stats.thisMonth })}
            <span className="mx-1.5 text-gray-200">&middot;</span>
            {t('referral.statsTotal', { count: stats.total })}
          </p>
        </div>
      </div>
    </div>
  );
}
