'use client';
import { useState, useCallback, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { useTranslation } from '@/lib/i18n';
import ScanActionsManager from '@/components/ScanActionsManager';
import { supabase } from '@/lib/supabase';

/* ─── Types ─────────────────────────────────────────────── */
export interface LoyaltySettings {
  points_per_scan: number;
  reward_threshold: number;
  reward_message: string;
  program_type: 'points' | 'stamps';
  stamps_total: number;
  mode_changed_at: string | null;
  previous_program_type: string | null;
  vip_threshold_points: number;
  vip_threshold_stamps: number;
  return_grace_days: number | null;
  welcome_bonus_points: number;
  birthday_bonus_points: number;
  max_scans_per_day: number;
  min_scan_delay_minutes: number;
  notify_reward_reached: boolean;
  notify_near_reward: boolean;
  notify_inactive: boolean;
}

interface Transaction {
  id: string;
  created_at: string;
  points_delta: number;
  type: string;
  customer_id: string;
}

interface Customer {
  id: string;
  total_points: number;
  stamps_count?: number;
  total_visits: number;
  last_visit_at: string | null;
}

interface Props {
  settings: LoyaltySettings;
  onSettingsChange: (s: LoyaltySettings) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  transactions: Transaction[];
  customers: Customer[];
  plan?: string;
  onUpgrade?: () => void;
}

/* ─── Section nav ───────────────────────────────────────── */
type Section = 'program' | 'referral' | 'advanced' | 'summary';

/* ─── Helpers ───────────────────────────────────────────── */
function SectionIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function ProBadge() {
  return <Badge variant="info" className="text-[10px] ml-2">PRO</Badge>;
}

/* ─── Main component ────────────────────────────────────── */
export default function LoyaltyTab({
  settings,
  onSettingsChange,
  onSave,
  saving,
  transactions,
  customers,
  plan,
  onUpgrade,
}: Props) {
  const { t, locale } = useTranslation();
  const [activeSection, setActiveSection] = useState<Section>('program');
  const isPro = plan === 'pro' || plan === 'enterprise';
  const today = new Date();

  const SECTIONS: { id: Section; label: string; icon: string }[] = [
    { id: 'program',   label: t('loyalty.tabProgram'),   icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
    { id: 'referral',  label: t('loyalty.tabReferral'),  icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
    { id: 'advanced',  label: t('loyalty.tabAdvanced'),  icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { id: 'summary',   label: t('loyalty.tabSummary'),   icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  ];

  function ComingSoon() {
    return (
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        {t('loyalty.comingSoon')}
      </div>
    );
  }

  const update = useCallback(
    (partial: Partial<LoyaltySettings>) => onSettingsChange({ ...settings, ...partial }),
    [settings, onSettingsChange],
  );

  /* ── Stats helpers ── */
  const stampsDistributed = transactions.filter(t => t.type === 'visit').length;
  const cardsCompletedThisMonth = transactions.filter(t => {
    const d = new Date(t.created_at);
    return t.type === 'reward_redeem' && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;
  const clientsInProgress = customers.filter(c => (c.stamps_count ?? 0) > 0 && (c.stamps_count ?? 0) < settings.stamps_total).length;
  const totalPointsDistributed = transactions.filter(t => t.points_delta > 0).reduce((a, t) => a + t.points_delta, 0);
  const pointsInCirculation = customers.reduce((a, c) => a + c.total_points, 0);
  const nearRewardCount = customers.filter(c => {
    if (settings.program_type === 'stamps') return (c.stamps_count ?? 0) >= settings.stamps_total - 2 && (c.stamps_count ?? 0) < settings.stamps_total;
    return c.total_points >= settings.reward_threshold * 0.7 && c.total_points < settings.reward_threshold;
  }).length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('loyalty.title')}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{t('loyalty.subtitle')}</p>
      </div>

      {/* Section nav (horizontal pills) */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {SECTIONS.map(s => {
          const active = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0',
                active
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700',
              ].join(' ')}
            >
              <SectionIcon d={s.icon} className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ═══════ SECTION 1 — Program type ═══════ */}
      {activeSection === 'program' && (
        <div className="space-y-5">
          {/* Mode transition warning */}
          {settings.mode_changed_at && (
            <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 rounded-xl p-3.5 text-sm text-warning-700">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <p>
                <strong>{t('loyalty.confirmModeSwitch', { mode: '' }).split('?')[0].replace(/\n/g, '')}</strong> — {t('loyalty.confirmModeSwitch', { mode: settings.previous_program_type === 'points' ? t('loyalty.modePoints') : t('loyalty.modeStamps') }).split('\n\n')[1] ?? ''}
              </p>
            </div>
          )}

          {/* Main modes */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('loyalty.modeTitle')}</h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.modeSubtitle')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  id: 'points' as const,
                  title: t('loyalty.modePoints'),
                  desc: t('loyalty.modePointsDesc'),
                  example: t('loyalty.modePointsExample'),
                  iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
                },
                {
                  id: 'stamps' as const,
                  title: t('loyalty.modeStamps'),
                  desc: t('loyalty.modeStampsDesc'),
                  example: t('loyalty.modeStampsExample'),
                  iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
                },
              ].map(mode => {
                const isActive = settings.program_type === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => {
                      if (mode.id !== settings.program_type) {
                        const confirmed = window.confirm(
                          t('loyalty.confirmModeSwitch', { mode: mode.title })
                        );
                        if (!confirmed) return;
                        update({
                          previous_program_type: settings.program_type,
                          program_type: mode.id,
                          mode_changed_at: new Date().toISOString(),
                        });
                      }
                    }}
                    className={[
                      'rounded-xl p-5 cursor-pointer border-2 transition-all duration-150 group',
                      isActive
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-gray-200 bg-white hover:border-gray-300',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'} transition-colors`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d={mode.iconPath} />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <span className="font-bold text-gray-900">{mode.title}</span>
                        {isActive && <Badge variant="info" className="ml-2">{t('loyalty.activeLabel')}</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed mb-1.5">{mode.desc}</p>
                    <p className="text-xs text-gray-400 italic">{mode.example}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Advanced programs */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {t('loyalty.advancedTitle')}
              {!isPro && <ProBadge />}
            </h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.advancedSubtitle')}</p>

            {isPro ? (
              <div className="space-y-6">
                {/* VIP Tiers */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">⭐ {t('loyalty.advancedVipLevels')}</h4>
                  <VipTiersManager programType={settings.program_type} t={t} />
                </div>
                {/* Multipliers */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">⚡ {t('loyalty.advancedMultipliers')}</h4>
                  <MultipliersManager t={t} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: t('loyalty.advancedVipLevels'),   desc: t('loyalty.advancedVipLevelsDesc'),   icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
                    { title: t('loyalty.advancedMultipliers'), desc: t('loyalty.advancedMultipliersDesc'), icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                  ].map((item, i) => (
                    <div key={i} className="rounded-xl border border-dashed border-gray-200 p-4 opacity-60">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                        <SectionIcon d={item.icon} className="w-4.5 h-4.5" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700 mb-1">{item.title}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
                {onUpgrade && (
                  <button onClick={onUpgrade} className="mt-5 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
                    {t('loyalty.advancedUnlock')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Loyalty rules (part of Program) ═══════ */}
      {activeSection === 'program' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('loyalty.baseSettingsTitle')}</h3>
            <p className="text-xs text-gray-400 mb-5">
              {settings.program_type === 'points'
                ? t('loyalty.baseSettingsPointsDesc')
                : t('loyalty.baseSettingsStampsDesc')}
            </p>

            <div className="space-y-5">
              {settings.program_type === 'points' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.pointsPerScan')}</label>
                      <input
                        type="number" min="1"
                        value={settings.points_per_scan}
                        onChange={e => update({ points_per_scan: parseInt(e.target.value) || 1 })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                      />
                      <p className="text-xs text-gray-400 mt-1">{t('loyalty.pointsPerScanHint')}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.rewardThreshold')}</label>
                      <input
                        type="number" min="1"
                        value={settings.reward_threshold}
                        onChange={e => update({ reward_threshold: parseInt(e.target.value) || 100 })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                      />
                      <p className="text-xs text-gray-400 mt-1">{t('loyalty.rewardThresholdHint')}</p>
                    </div>
                  </div>

                  {/* Visual calculator */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">{t('loyalty.simulation')}</p>
                    <div className="flex items-center gap-3 text-sm text-gray-700">
                      <span className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 font-mono tabular-nums">
                        {Math.ceil(settings.reward_threshold / settings.points_per_scan)} {t('loyalty.simulationVisits')}
                      </span>
                      <span className="text-gray-400">=</span>
                      <span className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 font-mono tabular-nums">
                        {settings.reward_threshold} {t('loyalty.simulationPts')}
                      </span>
                      <span className="text-gray-400">=</span>
                      <span className="bg-success-50 text-success-700 px-3 py-1.5 rounded-lg border border-success-200 font-semibold">
                        {t('loyalty.simulationReward')}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.stampsPerCard')}</label>
                    <input
                      type="number" min="3" max="20"
                      value={settings.stamps_total}
                      onChange={e => update({ stamps_total: Math.min(20, Math.max(3, parseInt(e.target.value) || 10)) })}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all max-w-xs"
                    />
                  </div>

                  {/* Stamp card preview */}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <p className="text-xs font-medium text-gray-500 mb-3">{t('loyalty.cardPreview')}</p>
                    <div className="flex flex-wrap gap-2.5">
                      {Array.from({ length: settings.stamps_total }, (_, i) => (
                        <div
                          key={i}
                          className={[
                            'w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all',
                            i < 3
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : i === settings.stamps_total - 1
                                ? 'border-dashed border-primary-300 bg-primary-50'
                                : 'border-gray-300 bg-white',
                          ].join(' ')}
                        >
                          {i < 3 && (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          )}
                          {i === settings.stamps_total - 1 && !( i < 3 ) && (
                            <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">3 {t('loyalty.stampsOnOf')} {settings.stamps_total} — {t('loyalty.lastIsReward')}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* VIP threshold */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {settings.program_type === 'stamps' ? t('loyalty.vipThresholdStamps') : t('loyalty.vipThresholdPoints')}
            </h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.vipThresholdDesc')}</p>
            <input
              type="number" min="1"
              value={settings.program_type === 'stamps' ? settings.vip_threshold_stamps : settings.vip_threshold_points}
              onChange={e => {
                const val = parseInt(e.target.value) || 1;
                if (settings.program_type === 'stamps') {
                  update({ vip_threshold_stamps: val });
                } else {
                  update({ vip_threshold_points: val });
                }
              }}
              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all max-w-xs"
            />
          </div>

          {/* Bonus points (Pro feature) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {t('loyalty.bonusTitle')}
              {!isPro && <ProBadge />}
            </h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.bonusSubtitle')}</p>

            {isPro ? (
              <div className="space-y-4">
                {/* Welcome bonus */}
                <div className="flex items-start gap-4 rounded-xl border border-gray-200 p-4">
                  <span className="text-xl flex-shrink-0 mt-0.5">🎁</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 mb-0.5">{t('loyalty.bonusFirstVisit')}</p>
                    <p className="text-xs text-gray-400 mb-2">{t('loyalty.bonusFirstVisitDesc')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" max="500" step="1"
                        value={settings.welcome_bonus_points}
                        onChange={e => update({ welcome_bonus_points: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                      <span className="text-xs text-gray-400">{settings.program_type === 'stamps' ? t('loyalty.bonusStamps') : t('loyalty.bonusPts')}</span>
                    </div>
                  </div>
                </div>

                {/* Birthday bonus */}
                <div className="flex items-start gap-4 rounded-xl border border-gray-200 p-4">
                  <span className="text-xl flex-shrink-0 mt-0.5">🎂</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 mb-0.5">{t('loyalty.bonusBirthday')}</p>
                    <p className="text-xs text-gray-400 mb-2">{t('loyalty.bonusBirthdayDesc')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" max="500" step="1"
                        value={settings.birthday_bonus_points}
                        onChange={e => update({ birthday_bonus_points: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                      <span className="text-xs text-gray-400">{settings.program_type === 'stamps' ? t('loyalty.bonusStamps') : t('loyalty.bonusPts')}</span>
                    </div>
                  </div>
                </div>

                {/* Referral & Signup — teasers (already managed in Referral tab) */}
                <div className="flex items-start gap-4 rounded-xl border border-dashed border-gray-200 p-4 opacity-50">
                  <span className="text-xl flex-shrink-0 mt-0.5">🤝</span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{t('loyalty.bonusReferral')}</p>
                    <p className="text-xs text-gray-400">{t('loyalty.bonusReferralConfigured')}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: t('loyalty.bonusFirstVisit'), desc: t('loyalty.bonusFirstVisitDesc'), icon: '🎁' },
                  { label: t('loyalty.bonusBirthday'),   desc: t('loyalty.bonusBirthdayDesc'),   icon: '🎂' },
                  { label: t('loyalty.bonusReferral'),   desc: t('loyalty.bonusReferralDesc'),   icon: '🤝' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-dashed border-gray-200 p-4 opacity-50">
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
                {onUpgrade && (
                  <button onClick={onUpgrade} className="mt-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                    {t('loyalty.bonusUnlock')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Scan action buttons ── */}
          <ScanActionsManager programType={settings.program_type} />
        </div>
      )}

      {/* ═══════ Rewards (part of Program) ═══════ */}
      {activeSection === 'program' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('loyalty.rewardTitle')}</h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.rewardSubtitle')}</p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.rewardMessageLabel')}</label>
                <input
                  type="text"
                  value={settings.reward_message}
                  onChange={e => update({ reward_message: e.target.value })}
                  placeholder={t('loyalty.rewardMessagePlaceholder')}
                  className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">{t('loyalty.rewardMessageHint')}</p>
              </div>

              {/* Preview card */}
              <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-xl p-5 border border-primary-200">
                <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider mb-2">{t('loyalty.rewardPreviewTitle')}</p>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-success-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{t('loyalty.rewardPreviewCongrats')}</p>
                      <p className="text-xs text-gray-500">{settings.reward_message || t('loyalty.rewardPreviewMessage')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-reward catalog */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {t('loyalty.rewardCatalogTitle')}
              {!isPro && <ProBadge />}
            </h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.rewardCatalogSubtitle')}</p>

            {isPro ? (
              <RewardCatalogManager programType={settings.program_type} t={t} />
            ) : (
              <>
                <div className="space-y-3">
                  {[
                    { type: t('loyalty.rewardFreeProduct'),    example: t('loyalty.rewardFreeProductDesc'),    icon: '☕' },
                    { type: t('loyalty.rewardPercentDiscount'), example: t('loyalty.rewardPercentDiscountDesc'), icon: '💸' },
                    { type: t('loyalty.rewardFixedDiscount'),   example: t('loyalty.rewardFixedDiscountDesc'),  icon: '🏷️' },
                    { type: t('loyalty.rewardCustomGift'),      example: t('loyalty.rewardCustomGiftDesc'),     icon: '🎁' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 p-3.5 opacity-50">
                      <span className="text-base flex-shrink-0">{item.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">{item.type}</p>
                        <p className="text-xs text-gray-400">{item.example}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {onUpgrade && (
                  <button onClick={onUpgrade} className="mt-5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                    {t('loyalty.rewardCatalogUnlock')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════ SECTION — Referral program ═══════ */}
      {activeSection === 'referral' && (
        <ReferralSection plan={plan} onUpgrade={onUpgrade} programType={settings.program_type} t={t} />
      )}

      {/* ═══════ Limits & security (part of Advanced) ═══════ */}
      {activeSection === 'advanced' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {t('loyalty.antifraudTitle')}
              {!isPro && <ProBadge />}
            </h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.antifraudSubtitle')}</p>

            {isPro ? (
              <div className="space-y-4">
                {/* Max scans per day */}
                <div className="flex items-start gap-4 rounded-xl border border-gray-200 p-4">
                  <span className="text-xl flex-shrink-0 mt-0.5">🛡️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 mb-0.5">{t('loyalty.antifraudMaxScans')}</p>
                    <p className="text-xs text-gray-400 mb-2">{t('loyalty.antifraudMaxScansDesc')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" max="50" step="1"
                        value={settings.max_scans_per_day}
                        onChange={e => update({ max_scans_per_day: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                      <span className="text-xs text-gray-400">{t('loyalty.antifraudPerDay')}</span>
                    </div>
                  </div>
                </div>

                {/* Min delay between scans */}
                <div className="flex items-start gap-4 rounded-xl border border-gray-200 p-4">
                  <span className="text-xl flex-shrink-0 mt-0.5">⏱️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 mb-0.5">{t('loyalty.antifraudMinDelay')}</p>
                    <p className="text-xs text-gray-400 mb-2">{t('loyalty.antifraudMinDelayDesc')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" max="1440" step="1"
                        value={settings.min_scan_delay_minutes}
                        onChange={e => update({ min_scan_delay_minutes: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                      <span className="text-xs text-gray-400">{t('loyalty.antifraudMinutes')}</span>
                    </div>
                  </div>
                </div>

                {/* Future: employee validation + alerts (teaser) */}
                {[
                  { label: t('loyalty.antifraudEmployeeValidation'), desc: t('loyalty.antifraudEmployeeValidationDesc') },
                  { label: t('loyalty.antifraudAlerts'),             desc: t('loyalty.antifraudAlertsDesc') },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-gray-200 p-4 opacity-50">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                    <span className="text-xs font-mono text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg flex-shrink-0">{t('loyalty.comingSoon')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: t('loyalty.antifraudMaxScans'),          desc: t('loyalty.antifraudMaxScansDesc'),          defaultVal: '1' },
                  { label: t('loyalty.antifraudMinDelay'),           desc: t('loyalty.antifraudMinDelayDesc'),           defaultVal: t('loyalty.antifraudMinDelayValue') },
                  { label: t('loyalty.antifraudEmployeeValidation'), desc: t('loyalty.antifraudEmployeeValidationDesc'), defaultVal: t('loyalty.antifraudDisabled') },
                  { label: t('loyalty.antifraudAlerts'),             desc: t('loyalty.antifraudAlertsDesc'),             defaultVal: t('loyalty.antifraudDisabled') },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-gray-200 p-4 opacity-50">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                    <span className="text-xs font-mono text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg flex-shrink-0">{item.defaultVal}</span>
                  </div>
                ))}
                {onUpgrade && (
                  <button onClick={onUpgrade} className="mt-1 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
                    {t('loyalty.antifraudProPlan')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Notifications (part of Advanced) ═══════ */}
      {activeSection === 'advanced' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {t('loyalty.notificationsTitle')}
              {!isPro && <ProBadge />}
            </h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.notificationsSubtitle')}</p>

            {isPro ? (
              <div className="space-y-3">
                {([
                  { key: 'notify_reward_reached' as const, label: t('loyalty.notifRewardReached'), desc: t('loyalty.notifRewardReachedDesc'), icon: '🏆', color: 'bg-success-50 border-success-200 text-success-700' },
                  { key: 'notify_near_reward' as const,    label: t('loyalty.notifNearReward'),    desc: t('loyalty.notifNearRewardDesc'),    icon: '🔔', color: 'bg-warning-50 border-warning-200 text-warning-700' },
                  { key: 'notify_inactive' as const,       label: t('loyalty.notifInactive'),      desc: t('loyalty.notifInactiveDesc'),      icon: '😴', color: 'bg-gray-50 border-gray-200 text-gray-600' },
                ] as const).map((item) => (
                  <div key={item.key} className={`flex items-start gap-3 rounded-xl border p-4 ${item.color}`}>
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs opacity-75">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => update({ [item.key]: !settings[item.key] })}
                      className={`flex-shrink-0 w-10 h-5 rounded-full relative transition-colors ${settings[item.key] ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings[item.key] ? 'left-[1.375rem]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}

                {/* Expiration — coming soon */}
                <div className="flex items-start gap-3 rounded-xl border p-4 opacity-50 bg-danger-50 border-danger-200 text-danger-700">
                  <span className="text-lg flex-shrink-0">⏰</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{t('loyalty.notifExpiration')}</p>
                    <p className="text-xs opacity-75">{t('loyalty.notifExpirationDesc')}</p>
                  </div>
                  <span className="text-xs font-mono text-gray-400 bg-white/60 px-2 py-1 rounded-lg flex-shrink-0">{t('loyalty.comingSoon')}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: t('loyalty.notifRewardReached'), desc: t('loyalty.notifRewardReachedDesc'), icon: '🏆', color: 'bg-success-50 border-success-200 text-success-700' },
                  { label: t('loyalty.notifNearReward'),    desc: t('loyalty.notifNearRewardDesc'),    icon: '🔔', color: 'bg-warning-50 border-warning-200 text-warning-700' },
                  { label: t('loyalty.notifInactive'),      desc: t('loyalty.notifInactiveDesc'),      icon: '😴', color: 'bg-gray-50 border-gray-200 text-gray-600' },
                  { label: t('loyalty.notifExpiration'),    desc: t('loyalty.notifExpirationDesc'),    icon: '⏰', color: 'bg-danger-50 border-danger-200 text-danger-700' },
                ].map((item, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-xl border p-4 opacity-50 ${item.color}`}>
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs opacity-75">{item.desc}</p>
                    </div>
                    <div className="flex-shrink-0 w-10 h-5 bg-gray-200 rounded-full relative">
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                ))}
                {onUpgrade && (
                  <button onClick={onUpgrade} className="mt-3 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
                    {t('loyalty.notifProPlan')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Customization (part of Advanced) ═══════ */}
      {activeSection === 'advanced' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('loyalty.customizationTitle')}</h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.customizationSubtitle')}</p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.customizationMessageLabel')}</label>
                <input
                  type="text"
                  value={settings.reward_message}
                  onChange={e => update({ reward_message: e.target.value })}
                  placeholder={t('loyalty.customizationMessagePlaceholder')}
                  className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                />
              </div>

              {/* Preview: what client sees */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">{t('loyalty.customizationPreview')}</p>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="max-w-xs mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                    <div className="bg-primary-600 px-4 py-3">
                      <p className="text-white text-xs font-semibold">{t('loyalty.customizationProgramLabel')}</p>
                    </div>
                    <div className="p-4 text-center">
                      {settings.program_type === 'stamps' ? (
                        <>
                          <div className="flex justify-center gap-1.5 mb-3">
                            {Array.from({ length: Math.min(settings.stamps_total, 12) }, (_, i) => (
                              <div
                                key={i}
                                className={`w-6 h-6 rounded-full border ${i < 7 ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}
                              />
                            ))}
                          </div>
                          <p className="text-xs text-gray-500">7 / {settings.stamps_total} {t('loyalty.customizationStampsLabel')}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-bold text-gray-900 tabular-nums">{Math.round(settings.reward_threshold * 0.7)}</p>
                          <p className="text-xs text-gray-500">points sur {settings.reward_threshold}</p>
                          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                            <div className="bg-primary-600 h-2 rounded-full" style={{ width: '70%' }} />
                          </div>
                        </>
                      )}
                      <p className="text-xs text-gray-400 mt-3 italic">{settings.reward_message || t('loyalty.rewardPreviewMessage')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced customization (Pro) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {t('loyalty.customizationAdvancedAppearance')}
              <ProBadge />
            </h3>
            <p className="text-xs text-gray-400 mb-5">{t('loyalty.customizationAdvancedDesc')}</p>
            <ComingSoon />
          </div>
        </div>
      )}

      {/* ═══════ SECTION 7 — Summary ═══════ */}
      {activeSection === 'summary' && (
        <div className="space-y-5">
          {/* Active program summary */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-5">{t('loyalty.summaryProgramActive')}</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-primary-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-primary-700 tabular-nums">
                  {settings.program_type === 'stamps' ? settings.stamps_total : settings.reward_threshold}
                </p>
                <p className="text-xs text-primary-600 mt-1">
                  {settings.program_type === 'stamps' ? t('loyalty.summaryStampsPerCard') : t('loyalty.summaryPointsForReward')}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {settings.program_type === 'stamps' ? '1' : settings.points_per_scan}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {settings.program_type === 'stamps' ? t('loyalty.summaryStampPerScan') : t('loyalty.summaryPointsPerScan')}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums capitalize">
                  {settings.program_type === 'stamps' ? t('loyalty.modeStamps') : t('loyalty.modePoints')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('loyalty.summaryActiveMode')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {settings.program_type === 'stamps'
                    ? settings.stamps_total
                    : Math.ceil(settings.reward_threshold / settings.points_per_scan)}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('loyalty.summaryVisitsNeeded')}</p>
              </div>
            </div>

            {/* Reward message preview */}
            <div className="mt-5 bg-success-50 rounded-xl p-4 border border-success-200">
              <p className="text-xs font-medium text-success-600 mb-1">{t('loyalty.summaryRewardMessage')}</p>
              <p className="text-sm text-success-700 font-semibold">{settings.reward_message || t('loyalty.summaryNotConfigured')}</p>
            </div>
          </div>

          {/* Live stats */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-5">{t('loyalty.statsTitle')}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {settings.program_type === 'stamps' ? (
                <>
                  <StatCard icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" label={t('loyalty.statsCompletedCardsMonth')} value={cardsCompletedThisMonth} bg="bg-warning-50" text="text-warning-700" />
                  <StatCard icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" label={t('loyalty.statsStampsDistributed')} value={stampsDistributed} bg="bg-success-50" text="text-success-700" />
                  <StatCard icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" label={t('loyalty.statsCustomersInProgress')} value={clientsInProgress} bg="bg-primary-50" text="text-primary-700" />
                </>
              ) : (
                <>
                  <StatCard icon="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" label={t('loyalty.statsPointsDistributed')} value={totalPointsDistributed} bg="bg-primary-50" text="text-primary-700" />
                  <StatCard icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" label={t('loyalty.statsNearReward')} value={nearRewardCount} bg="bg-success-50" text="text-success-700" />
                  <StatCard icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" label={t('loyalty.statsPointsCirculation')} value={pointsInCirculation} bg="bg-purple-50" text="text-purple-700" />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ STICKY SAVE BAR ═══════ */}
      <div className="sticky bottom-0 bg-white/80 backdrop-blur-sm border-t border-gray-100 -mx-6 px-6 py-4 -mb-6 flex items-center justify-between gap-4">
        <p className="text-xs text-gray-400">
          {settings.program_type === 'stamps'
            ? `${settings.stamps_total} ${t('loyalty.statsSummaryStamps')}${settings.reward_message || '—'}`
            : `${settings.points_per_scan} ${t('loyalty.statsSummaryPoints')}${settings.reward_threshold} ${t('loyalty.simulationPts')} · ${settings.reward_message || '—'}`}
        </p>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
        >
          {saving
            ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-ds-spin" />{t('loyalty.savingBtn')}</>
            : <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                {t('loyalty.saveBtn')}
              </>}
        </button>
      </div>
    </div>
  );
}

/* ─── Small stat card ───────────────────────────────────── */
function StatCard({ icon, label, value, bg, text }: { icon: string; label: string; value: number; bg: string; text: string }) {
  const { locale } = useTranslation();
  return (
    <div className={`${bg} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <svg className={`w-4 h-4 ${text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
        <p className={`text-xs ${text} opacity-75`}>{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${text}`}>{value.toLocaleString(locale)}</p>
    </div>
  );
}

/* ─── Referral Section (self-contained / modular) ──────── */
interface ReferralSettings {
  enabled: boolean;
  rewardReferrer: number;
  rewardReferee: number;
  maxPerCustomer: number;
}

/* ── VIP Tiers Manager (Pro) ──────────────────────────────── */

interface VipTier { id: string; name: string; min_points: number; icon: string; color: string; perk: string; }

function VipTiersManager({ programType, t }: { programType: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', min_points: '0', icon: '⭐', color: '#F59E0B', perk: '' });
  const [saving, setSaving] = useState(false);
  const unit = programType === 'stamps' ? t('loyalty.bonusStamps') : t('loyalty.bonusPts');

  const fetchTiers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/vip-tiers', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) { const d = await res.json(); setTiers(d.tiers ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchTiers(); }, [fetchTiers]);

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }
    const payload = { ...(editId ? { id: editId } : {}), name: form.name, min_points: parseInt(form.min_points) || 0, icon: form.icon, color: form.color, perk: form.perk };
    const res = await fetch('/api/vip-tiers', { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
    if (res.ok) { setShowForm(false); setEditId(null); setForm({ name: '', min_points: '0', icon: '⭐', color: '#F59E0B', perk: '' }); fetchTiers(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/vip-tiers?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
    fetchTiers();
  };

  if (loading) return <div className="text-sm text-gray-400 py-2 text-center">{t('common.loading')}</div>;

  return (
    <div className="space-y-2">
      {tiers.map(tier => (
        <div key={tier.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
          <span className="text-lg">{tier.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700">{tier.name}</p>
            <p className="text-xs text-gray-400">{tier.min_points}+ {unit}{tier.perk ? ` · ${tier.perk}` : ''}</p>
          </div>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tier.color }} />
          <button onClick={() => { setForm({ name: tier.name, min_points: String(tier.min_points), icon: tier.icon, color: tier.color, perk: tier.perk }); setEditId(tier.id); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button onClick={() => handleDelete(tier.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      ))}
      {showForm && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.vipTierName')}</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Gold" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.vipTierThreshold')}</label><input type="number" min="0" value={form.min_points} onChange={e => setForm(f => ({ ...f, min_points: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></div>
            <div className="flex gap-2">
              <div className="flex-1"><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.rewardCatalogIcon')}</label><input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-center" maxLength={4} /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.vipTierColor')}</label><input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-9 mt-0.5 rounded-lg border border-gray-200 cursor-pointer" /></div>
            </div>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.vipTierPerk')}</label><input value={form.perk} onChange={e => setForm(f => ({ ...f, perk: e.target.value }))} placeholder="Ex: -10% permanent" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name} className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? t('common.savingDots') : editId ? t('common.save') : t('loyalty.rewardCatalogAdd')}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {!showForm && (
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', min_points: '0', icon: '⭐', color: '#F59E0B', perk: '' }); }} className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors">
          + {t('loyalty.vipTierAdd')}
        </button>
      )}
    </div>
  );
}

/* ── Multipliers Manager (Pro) ───────────────────────────── */

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

interface Multiplier { id: string; name: string; multiplier: number; day_of_week: number | null; start_time: string | null; end_time: string | null; active: boolean; }

function MultipliersManager({ t }: { t: (k: string, v?: Record<string, string | number>) => string }) {
  const [items, setItems] = useState<Multiplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', multiplier: '2', day_of_week: '', start_time: '', end_time: '' });
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/point-multipliers', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) { const d = await res.json(); setItems(d.multipliers ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }
    const payload = { ...(editId ? { id: editId } : {}), name: form.name, multiplier: parseFloat(form.multiplier) || 2, day_of_week: form.day_of_week !== '' ? parseInt(form.day_of_week) : null, start_time: form.start_time || null, end_time: form.end_time || null };
    const res = await fetch('/api/point-multipliers', { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
    if (res.ok) { setShowForm(false); setEditId(null); setForm({ name: '', multiplier: '2', day_of_week: '', start_time: '', end_time: '' }); fetchItems(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/point-multipliers?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
    fetchItems();
  };

  if (loading) return <div className="text-sm text-gray-400 py-2 text-center">{t('common.loading')}</div>;

  return (
    <div className="space-y-2">
      {items.map(m => (
        <div key={m.id} className={`flex items-center gap-3 rounded-xl border p-3 ${m.active ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-50'}`}>
          <span className="text-lg">⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700">{m.name}</p>
            <p className="text-xs text-gray-400">
              x{m.multiplier}
              {m.day_of_week !== null ? ` · ${DAY_LABELS[m.day_of_week]}` : ' · Tous les jours'}
              {m.start_time && m.end_time ? ` · ${m.start_time}–${m.end_time}` : ''}
            </p>
          </div>
          <button onClick={() => { setForm({ name: m.name, multiplier: String(m.multiplier), day_of_week: m.day_of_week !== null ? String(m.day_of_week) : '', start_time: m.start_time ?? '', end_time: m.end_time ?? '' }); setEditId(m.id); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      ))}
      {showForm && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.multiplierName')}</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Happy Hour x2" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.multiplierValue')}</label><input type="number" min="1" max="10" step="0.5" value={form.multiplier} onChange={e => setForm(f => ({ ...f, multiplier: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.multiplierDay')}</label>
              <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                <option value="">{t('loyalty.multiplierAllDays')}</option>
                {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.multiplierFrom')}</label><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.multiplierTo')}</label><input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name} className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? t('common.savingDots') : editId ? t('common.save') : t('loyalty.rewardCatalogAdd')}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {!showForm && (
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', multiplier: '2', day_of_week: '', start_time: '', end_time: '' }); }} className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors">
          + {t('loyalty.multiplierAdd')}
        </button>
      )}
    </div>
  );
}

/* ── Reward Catalog Manager (Pro) ─────────────────────────── */

interface CatalogReward {
  id: string;
  name: string;
  type: 'free_product' | 'percent_discount' | 'fixed_discount' | 'custom';
  value: number | null;
  points_cost: number;
  icon: string;
  active: boolean;
}

const REWARD_TYPES = [
  { value: 'free_product',      label: '☕ Produit offert',     needsValue: false },
  { value: 'percent_discount',  label: '💸 Réduction %',       needsValue: true, unit: '%' },
  { value: 'fixed_discount',    label: '🏷️ Réduction fixe',    needsValue: true, unit: '€' },
  { value: 'custom',            label: '🎁 Cadeau personnalisé', needsValue: false },
];

function RewardCatalogManager({ programType, t }: { programType: string; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const [rewards, setRewards] = useState<CatalogReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'free_product', value: '', points_cost: '0', icon: '🎁' });
  const [saving, setSaving] = useState(false);

  const unit = programType === 'stamps' ? t('loyalty.bonusStamps') : t('loyalty.bonusPts');

  const fetchRewards = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/reward-catalog', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setRewards(data.rewards ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRewards(); }, [fetchRewards]);

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    const payload = {
      ...(editId ? { id: editId } : {}),
      name: form.name,
      type: form.type,
      value: form.value ? parseFloat(form.value) : null,
      points_cost: parseInt(form.points_cost) || 0,
      icon: form.icon,
    };

    const res = await fetch('/api/reward-catalog', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowForm(false);
      setEditId(null);
      setForm({ name: '', type: 'free_product', value: '', points_cost: '0', icon: '🎁' });
      fetchRewards();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/reward-catalog?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    fetchRewards();
  };

  const startEdit = (r: CatalogReward) => {
    setForm({ name: r.name, type: r.type, value: r.value?.toString() ?? '', points_cost: r.points_cost.toString(), icon: r.icon });
    setEditId(r.id);
    setShowForm(true);
  };

  const typeConfig = REWARD_TYPES.find(rt => rt.value === form.type);

  if (loading) return <div className="text-sm text-gray-400 py-4 text-center">{t('common.loading')}</div>;

  return (
    <div className="space-y-3">
      {rewards.length === 0 && !showForm && (
        <div className="text-center py-6">
          <p className="text-2xl mb-2">🎁</p>
          <p className="text-sm text-gray-400">{t('loyalty.rewardCatalogEmpty')}</p>
        </div>
      )}

      {rewards.map(r => (
        <div key={r.id} className={`flex items-center gap-3 rounded-xl border p-3.5 ${r.active ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-50'}`}>
          <span className="text-lg flex-shrink-0">{r.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">{r.name}</p>
            <p className="text-xs text-gray-400">
              {r.points_cost > 0 ? `${r.points_cost} ${unit}` : t('loyalty.rewardCatalogFree')}
              {r.value ? ` · ${r.type === 'percent_discount' ? `${r.value}%` : `${r.value}€`}` : ''}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
      ))}

      {showForm && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.rewardCatalogName')}</label>
              <input
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Café offert"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.rewardCatalogType')}</label>
              <select
                value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20 bg-white"
              >
                {REWARD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {typeConfig?.needsValue && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.rewardCatalogValue')} ({typeConfig.unit})</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.rewardCatalogCost')} ({unit})</label>
              <input
                type="number" min="0"
                value={form.points_cost} onChange={e => setForm(f => ({ ...f, points_cost: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('loyalty.rewardCatalogIcon')}</label>
              <input
                value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600/20 text-center"
                maxLength={4}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave} disabled={saving || !form.name}
              className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? t('common.savingDots') : editId ? t('common.save') : t('loyalty.rewardCatalogAdd')}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditId(null); setForm({ name: '', type: 'free_product', value: '', points_cost: '0', icon: '🎁' }); }}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', type: 'free_product', value: '', points_cost: '0', icon: '🎁' }); }}
          className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors"
        >
          + {t('loyalty.rewardCatalogAddBtn')}
        </button>
      )}
    </div>
  );
}

function ReferralSection({
  plan,
  onUpgrade,
  programType,
  t,
}: {
  plan?: string;
  onUpgrade?: () => void;
  programType: 'points' | 'stamps';
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  // Plans that include the referral_program feature (mirroring lib/plan-limits.ts)
  const REFERRAL_PLANS = ['starter', 'pro', 'enterprise'];
  const canUseReferral = REFERRAL_PLANS.includes(plan ?? '');
  const [referral, setReferral] = useState<ReferralSettings>({
    enabled: false,
    rewardReferrer: 50,
    rewardReferee: 20,
    maxPerCustomer: 10,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canUseReferral) return;
    let cancelled = false;
    fetch('/api/referral/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        setReferral({
          enabled: data.enabled ?? false,
          rewardReferrer: data.rewardReferrer ?? 50,
          rewardReferee: data.rewardReferee ?? 20,
          maxPerCustomer: data.maxPerCustomer ?? 10,
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, [canUseReferral]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/referral/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(referral),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Plan-gated: show upgrade prompt ── */
  if (!canUseReferral) {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            {t('loyalty.tabReferral')}
            <Badge variant="info" className="text-[10px] ml-2">STARTER</Badge>
          </h3>
          <p className="text-xs text-gray-400 mb-5">{t('loyalty.referralEnabledDesc')}</p>

          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center opacity-60">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">{t('loyalty.referralUpgrade')}</p>
          </div>

          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="mt-5 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              {t('loyalty.referralUpgrade')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const typeLabel = programType === 'stamps' ? t('loyalty.modeStamps').toLowerCase() : 'points';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('loyalty.tabReferral')}</h3>
        <p className="text-xs text-gray-400 mb-5">{t('loyalty.referralEnabledDesc')}</p>

        <div className="space-y-5">
          {/* Toggle: Enable / disable */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">{t('loyalty.referralEnabled')}</p>
              <p className="text-xs text-gray-400">{t('loyalty.referralEnabledDesc')}</p>
            </div>
            <button
              onClick={() => setReferral(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                referral.enabled ? 'bg-primary-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                  referral.enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Referrer reward */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.referralRewardReferrer')}</label>
            <input
              type="number"
              min="1"
              value={referral.rewardReferrer}
              onChange={e => setReferral(prev => ({ ...prev, rewardReferrer: parseInt(e.target.value) || 1 }))}
              disabled={!referral.enabled}
              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed max-w-xs"
            />
            <p className="text-xs text-gray-400 mt-1">{t('loyalty.referralRewardReferrerDesc')} ({typeLabel})</p>
          </div>

          {/* Referee reward */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.referralRewardReferee')}</label>
            <input
              type="number"
              min="1"
              value={referral.rewardReferee}
              onChange={e => setReferral(prev => ({ ...prev, rewardReferee: parseInt(e.target.value) || 1 }))}
              disabled={!referral.enabled}
              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed max-w-xs"
            />
            <p className="text-xs text-gray-400 mt-1">{t('loyalty.referralRewardRefereeDesc')} ({typeLabel})</p>
          </div>

          {/* Max referrals per customer */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('loyalty.referralMaxPerCustomer')}</label>
            <input
              type="number"
              min="1"
              max="100"
              value={referral.maxPerCustomer}
              onChange={e => setReferral(prev => ({ ...prev, maxPerCustomer: Math.min(100, Math.max(1, parseInt(e.target.value) || 1)) }))}
              disabled={!referral.enabled}
              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed max-w-xs"
            />
            <p className="text-xs text-gray-400 mt-1">{t('loyalty.referralMaxPerCustomerDesc')}</p>
          </div>

          {/* Save button */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-ds-spin" />
                  {t('loyalty.savingBtn')}
                </>
              ) : saved ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  {t('loyalty.referralSaved')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  {t('loyalty.saveBtn')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
