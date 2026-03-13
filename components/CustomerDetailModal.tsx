'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';

/* ─── Types ──────────────────────────────────────────── */
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
  restaurant_id: string;
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

interface LoyaltySettings {
  program_type: 'points' | 'stamps';
  stamps_total: number;
  reward_threshold: number;
  points_per_scan: number;
  vip_threshold_points: number;
  vip_threshold_stamps: number;
}

interface Props {
  customer: Customer;
  transactions: Transaction[];
  loyaltySettings: LoyaltySettings;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onClose: () => void;
}

/* ─── Inline SVG icons ───────────────────────────────── */
const IClose = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ─── Helpers ────────────────────────────────────────── */
function getStatus(
  c: Customer,
  programType: 'points' | 'stamps',
  vipThreshold: number,
): 'vip' | 'active' | 'inactive' {
  const lastVisit = c.last_visit_at ? new Date(c.last_visit_at) : null;
  if (!lastVisit || (Date.now() - lastVisit.getTime()) > 30 * 86400000) return 'inactive';
  if (programType === 'stamps') {
    if ((c.stamps_count ?? 0) >= vipThreshold) return 'vip';
  } else {
    if (c.total_points >= vipThreshold) return 'vip';
  }
  return 'active';
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function formatDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Component ──────────────────────────────────────── */
export default function CustomerDetailModal({ customer, transactions, loyaltySettings, locale, t, onClose }: Props) {
  const c = customer;
  const isStamps = loyaltySettings.program_type === 'stamps';
  const vipThreshold = isStamps ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points;
  const status = getStatus(c, loyaltySettings.program_type, vipThreshold);

  // Filter transactions for this customer
  const customerTx = useMemo(
    () => transactions
      .filter(tx => tx.customer_id === c.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [transactions, c.id],
  );

  // Compute visit frequency (avg days between visits)
  const visitFrequency = useMemo(() => {
    const visits = customerTx.filter(tx => tx.type === 'visit').map(tx => new Date(tx.created_at).getTime());
    if (visits.length < 2) return null;
    const sorted = [...visits].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i] - sorted[i - 1]) / 86400000);
    }
    return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }, [customerTx]);

  // Weekly visit pattern (0=Sunday)
  const weekdayPattern = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    customerTx.filter(tx => tx.type === 'visit').forEach(tx => {
      days[new Date(tx.created_at).getDay()]++;
    });
    return days;
  }, [customerTx]);

  const dayLabels = [
    t('customerDetail.sun'), t('customerDetail.mon'), t('customerDetail.tue'),
    t('customerDetail.wed'), t('customerDetail.thu'), t('customerDetail.fri'),
    t('customerDetail.sat'),
  ];
  const maxDay = Math.max(...weekdayPattern, 1);

  // Monthly activity (last 6 months)
  const monthlyActivity = useMemo(() => {
    const months: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString(locale, { month: 'short' });
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const count = customerTx.filter(tx => {
        const t = new Date(tx.created_at).getTime();
        return t >= start && t < end;
      }).length;
      months.push({ label, count });
    }
    return months;
  }, [customerTx, locale]);
  const maxMonth = Math.max(...monthlyActivity.map(m => m.count), 1);

  // Customer since (days)
  const customerDays = daysSince(c.created_at) ?? 0;
  const lastVisitDays = daysSince(c.last_visit_at);

  // Loyalty progress
  const loyaltyProgress = isStamps
    ? { current: c.stamps_count ?? 0, goal: loyaltySettings.stamps_total, label: t('customerDetail.stamps') }
    : { current: c.total_points, goal: loyaltySettings.reward_threshold, label: t('customerDetail.points') };
  const progressPct = Math.min(100, Math.round((loyaltyProgress.current / loyaltyProgress.goal) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16 px-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 px-6 pt-5 pb-4 border-b border-gray-100 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {c.first_name} {c.last_name}
              </h2>
              <p className="text-sm text-gray-400 truncate mt-0.5">{c.email}</p>
            </div>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
              <StatusBadgeLocal status={status} t={t} />
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <IClose />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── KPI Cards ──────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label={t('customerDetail.totalVisits')} value={String(c.total_visits)} />
            <KpiCard
              label={t('customerDetail.lastVisit')}
              value={lastVisitDays !== null ? t('customerDetail.daysAgo', { count: lastVisitDays }) : '—'}
            />
            <KpiCard
              label={t('customerDetail.frequency')}
              value={visitFrequency !== null ? t('customerDetail.everyNDays', { count: visitFrequency }) : '—'}
            />
            <KpiCard
              label={t('customerDetail.completedCards')}
              value={String(c.completed_cards ?? 0)}
            />
          </div>

          {/* ── Loyalty Progress ────────────────── */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500 uppercase">{t('customerDetail.loyaltyProgress')}</p>
              <p className="text-sm font-bold text-gray-900">
                {loyaltyProgress.current} / {loyaltyProgress.goal} {loyaltyProgress.label}
              </p>
            </div>
            {isStamps ? (
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: loyaltySettings.stamps_total }, (_, i) => (
                  <div
                    key={i}
                    className={[
                      'w-5 h-5 rounded-full border-2 transition-colors',
                      i < (c.stamps_count ?? 0) ? 'bg-gray-900 border-gray-900' : 'border-gray-300',
                    ].join(' ')}
                  />
                ))}
              </div>
            ) : (
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-primary-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* ── Customer Info ──────────────────── */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <InfoRow label={t('customerDetail.memberSince')} value={formatDate(c.created_at, locale)} />
            <InfoRow
              label={t('customerDetail.birthday')}
              value={c.birth_date ? new Date(c.birth_date).toLocaleDateString(locale, { day: '2-digit', month: 'long' }) : '—'}
            />
            <InfoRow
              label={t('customerDetail.memberDuration')}
              value={customerDays > 0 ? t('customerDetail.nDays', { count: customerDays }) : t('customerDetail.today')}
            />
            <InfoRow
              label={isStamps ? t('customerDetail.totalStamps') : t('customerDetail.totalPointsLabel')}
              value={String(isStamps ? (c.stamps_count ?? 0) : c.total_points)}
            />
          </div>

          {/* ── Weekday Pattern ─────────────────── */}
          {c.total_visits > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-3">{t('customerDetail.visitPattern')}</p>
              <div className="flex items-end gap-1.5 h-16">
                {weekdayPattern.map((count, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary-100 rounded-t transition-all"
                      style={{ height: `${Math.max(4, (count / maxDay) * 48)}px` }}
                    >
                      {count > 0 && (
                        <div
                          className="w-full bg-primary-600 rounded-t transition-all"
                          style={{ height: '100%' }}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">{dayLabels[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Monthly Activity ────────────────── */}
          {customerTx.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-3">{t('customerDetail.monthlyActivity')}</p>
              <div className="flex items-end gap-2 h-20">
                {monthlyActivity.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-gray-700 tabular-nums">{m.count || ''}</span>
                    <div className="w-full bg-gray-100 rounded-lg overflow-hidden" style={{ height: '48px' }}>
                      <div
                        className="w-full bg-primary-200 rounded-lg transition-all"
                        style={{ height: `${Math.max(4, (m.count / maxMonth) * 48)}px`, marginTop: `${48 - Math.max(4, (m.count / maxMonth) * 48)}px` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Transaction History ─────────────── */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-3">{t('customerDetail.transactionHistory')}</p>
            {customerTx.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">{t('customerDetail.noTransactions')}</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {customerTx.slice(0, 50).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={[
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0',
                        tx.type === 'reward_redeem'
                          ? 'bg-amber-50 text-amber-600'
                          : tx.points_delta > 0
                            ? 'bg-success-50 text-success-600'
                            : 'bg-danger-50 text-danger-600',
                      ].join(' ')}>
                        {tx.type === 'reward_redeem' ? '🎁' : tx.points_delta > 0 ? '↑' : '↓'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {tx.type === 'reward_redeem'
                            ? t('customerDetail.txReward')
                            : tx.type === 'visit'
                              ? t('customerDetail.txVisit')
                              : tx.type === 'manual'
                                ? t('customerDetail.txManual')
                                : tx.type}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(tx.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <span className={[
                      'text-sm font-bold tabular-nums',
                      tx.points_delta > 0 ? 'text-success-600' : 'text-danger-600',
                    ].join(' ')}>
                      {tx.points_delta > 0 ? '+' : ''}{tx.points_delta} {isStamps ? t('customerDetail.stamps') : 'pts'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────── */
function StatusBadgeLocal({ status, t }: { status: 'vip' | 'active' | 'inactive'; t: (key: string) => string }) {
  if (status === 'vip') return <Badge variant="vip">{t('clients.statusVip')}</Badge>;
  if (status === 'active') return <Badge variant="success">{t('clients.statusActive')}</Badge>;
  return <Badge variant="neutral">{t('clients.statusInactive')}</Badge>;
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-[10px] text-gray-400 uppercase font-medium">{label}</p>
      <p className="text-base font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className="text-sm text-gray-900 font-medium mt-0.5">{value}</p>
    </div>
  );
}
