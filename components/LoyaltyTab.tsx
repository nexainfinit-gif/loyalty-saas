'use client';
import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';

/* ─── Types ─────────────────────────────────────────────── */
export interface LoyaltySettings {
  points_per_scan: number;
  reward_threshold: number;
  reward_message: string;
  program_type: 'points' | 'stamps';
  stamps_total: number;
  mode_changed_at: string | null;
  previous_program_type: string | null;
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
type Section = 'program' | 'rules' | 'rewards' | 'security' | 'notifications' | 'customization' | 'summary';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'program',        label: 'Type de programme',   icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { id: 'rules',          label: 'Règles de fidélité',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'rewards',        label: 'Récompenses',         icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7' },
  { id: 'security',       label: 'Limites & sécurité',  icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { id: 'notifications',  label: 'Notifications auto',  icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'customization',  label: 'Personnalisation',    icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { id: 'summary',        label: 'Résumé & aperçu',     icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

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

function ComingSoon() {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-400">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      Bientôt disponible
    </div>
  );
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
  const [activeSection, setActiveSection] = useState<Section>('program');
  const isPro = plan === 'pro' || plan === 'enterprise';
  const today = new Date();

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
        <h2 className="text-2xl font-bold text-gray-900">Fidélité</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configurez et personnalisez votre programme de fidélité</p>
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
                <strong>Transition en cours</strong> — Les clients ayant des{' '}
                {settings.previous_program_type === 'points' ? 'points' : 'tampons'} avant le{' '}
                {new Date(settings.mode_changed_at).toLocaleDateString('fr-BE')}{' '}
                continuent sur l&apos;ancien mode jusqu&apos;à leur récompense.
              </p>
            </div>
          )}

          {/* Main modes */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Mode principal</h3>
            <p className="text-xs text-gray-400 mb-5">Choisissez comment vos clients accumulent leur fidélité</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  id: 'points' as const,
                  title: 'Points',
                  desc: 'Chaque scan ajoute des points. Récompense automatique au seuil.',
                  example: 'Ex : 1 scan = 5 pts → Café offert à 50 pts',
                  iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
                },
                {
                  id: 'stamps' as const,
                  title: 'Tampons',
                  desc: 'Chaque scan = 1 tampon. Récompense quand la carte est pleine.',
                  example: 'Ex : 10 tampons → 1 produit offert',
                  iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
                },
              ].map(mode => {
                const isActive = settings.program_type === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => {
                      if (mode.id !== settings.program_type) {
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
                        {isActive && <Badge variant="info" className="ml-2">ACTIF</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed mb-1.5">{mode.desc}</p>
                    <p className="text-xs text-gray-400 italic">{mode.example}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Future modes (teaser) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Programmes avancés
              <ProBadge />
            </h3>
            <p className="text-xs text-gray-400 mb-5">Débloquez des mécaniques de fidélisation puissantes</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title: 'Récompenses personnalisées', desc: 'Offres uniques par palier atteint', icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7' },
                { title: 'Niveaux VIP',          desc: 'Bronze, Silver, Gold — progression auto', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
                { title: 'Multiplicateurs',      desc: 'Happy hours, x2 les mardis, etc.', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
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

            {!isPro && onUpgrade && (
              <button
                onClick={onUpgrade}
                className="mt-5 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
              >
                Passer au plan Pro pour débloquer
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════ SECTION 2 — Loyalty rules ═══════ */}
      {activeSection === 'rules' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Paramètres de base</h3>
            <p className="text-xs text-gray-400 mb-5">
              {settings.program_type === 'points'
                ? 'Définissez combien de points chaque scan rapporte et le seuil de récompense'
                : 'Définissez le nombre de tampons pour compléter une carte'}
            </p>

            <div className="space-y-5">
              {settings.program_type === 'points' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Points par scan</label>
                      <input
                        type="number" min="1"
                        value={settings.points_per_scan}
                        onChange={e => update({ points_per_scan: parseInt(e.target.value) || 1 })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                      />
                      <p className="text-xs text-gray-400 mt-1">Chaque passage en caisse = ce nombre de points</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Seuil de récompense</label>
                      <input
                        type="number" min="1"
                        value={settings.reward_threshold}
                        onChange={e => update({ reward_threshold: parseInt(e.target.value) || 100 })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                      />
                      <p className="text-xs text-gray-400 mt-1">Nombre de points pour déclencher la récompense</p>
                    </div>
                  </div>

                  {/* Visual calculator */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">Simulation</p>
                    <div className="flex items-center gap-3 text-sm text-gray-700">
                      <span className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 font-mono tabular-nums">
                        {Math.ceil(settings.reward_threshold / settings.points_per_scan)} visites
                      </span>
                      <span className="text-gray-400">=</span>
                      <span className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 font-mono tabular-nums">
                        {settings.reward_threshold} pts
                      </span>
                      <span className="text-gray-400">=</span>
                      <span className="bg-success-50 text-success-700 px-3 py-1.5 rounded-lg border border-success-200 font-semibold">
                        Récompense
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Nombre de tampons par carte</label>
                    <input
                      type="number" min="3" max="20"
                      value={settings.stamps_total}
                      onChange={e => update({ stamps_total: Math.min(20, Math.max(3, parseInt(e.target.value) || 10)) })}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all max-w-xs"
                    />
                  </div>

                  {/* Stamp card preview */}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <p className="text-xs font-medium text-gray-500 mb-3">Aperçu de la carte</p>
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
                    <p className="text-xs text-gray-400 mt-3">3 tampons sur {settings.stamps_total} — dernier = récompense</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bonus rules (Pro teaser) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Bonus & accélérateurs
              <ProBadge />
            </h3>
            <p className="text-xs text-gray-400 mb-5">Offrez des bonus pour encourager l&apos;engagement</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Bonus première visite',   desc: 'Points offerts à l\'inscription', icon: '🎁' },
                { label: 'Bonus anniversaire',       desc: 'Points doublés le jour J',        icon: '🎂' },
                { label: 'Bonus parrainage',         desc: 'Récompensez le parrain + filleul', icon: '🤝' },
                { label: 'Bonus inscription',        desc: 'Points de bienvenue',              icon: '👋' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-dashed border-gray-200 p-4 opacity-50">
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {!isPro && onUpgrade && (
              <button onClick={onUpgrade} className="mt-5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                Débloquer avec le plan Pro →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════ SECTION 3 — Rewards ═══════ */}
      {activeSection === 'rewards' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Récompense active</h3>
            <p className="text-xs text-gray-400 mb-5">Ce que vos clients reçoivent quand ils atteignent le seuil</p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Message de récompense</label>
                <input
                  type="text"
                  value={settings.reward_message}
                  onChange={e => update({ reward_message: e.target.value })}
                  placeholder="Ex : Café offert ! Bravo pour votre fidélité 🎉"
                  className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">Affiché au client quand il scanne après avoir atteint le seuil</p>
              </div>

              {/* Preview card */}
              <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-xl p-5 border border-primary-200">
                <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider mb-2">Aperçu client</p>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-success-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Félicitations !</p>
                      <p className="text-xs text-gray-500">{settings.reward_message || 'Récompense offerte !'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-reward (Pro teaser) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Catalogue de récompenses
              <ProBadge />
            </h3>
            <p className="text-xs text-gray-400 mb-5">Proposez plusieurs récompenses à vos clients fidèles</p>

            <div className="space-y-3">
              {[
                { type: 'Produit offert',     example: 'Café, dessert, entrée…',   icon: '☕' },
                { type: 'Réduction %',         example: '-20% sur la prochaine commande', icon: '💸' },
                { type: 'Réduction fixe',      example: '-5€ sur l\'addition',       icon: '🏷️' },
                { type: 'Cadeau personnalisé', example: 'Expérience VIP, menu dégustation', icon: '🎁' },
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

            {!isPro && onUpgrade && (
              <button onClick={onUpgrade} className="mt-5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                Débloquer avec le plan Pro →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════ SECTION 4 — Limits & security ═══════ */}
      {activeSection === 'security' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Anti-fraude & limites
              <ProBadge />
            </h3>
            <p className="text-xs text-gray-400 mb-5">Protégez votre programme contre les abus</p>

            <div className="space-y-4">
              {[
                { label: 'Scans max par jour (par client)',     desc: 'Empêche les scans multiples le même jour',   defaultVal: '1' },
                { label: 'Délai minimum entre 2 scans',         desc: 'Ex : 2h entre chaque scan',                   defaultVal: '2h' },
                { label: 'Validation par un employé',            desc: 'Le scan doit être confirmé en caisse',        defaultVal: 'Désactivé' },
                { label: 'Alerte fraude automatique',            desc: 'Notification si comportement suspect détecté', defaultVal: 'Désactivé' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-gray-200 p-4 opacity-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                  <span className="text-xs font-mono text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg flex-shrink-0">{item.defaultVal}</span>
                </div>
              ))}
            </div>

            {!isPro && onUpgrade && (
              <button onClick={onUpgrade} className="mt-5 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
                Disponible avec le plan Pro
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════ SECTION 5 — Notifications ═══════ */}
      {activeSection === 'notifications' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Notifications automatiques
              <ProBadge />
            </h3>
            <p className="text-xs text-gray-400 mb-5">Envoyez des messages automatiques à vos clients selon leur activité</p>

            <div className="space-y-3">
              {[
                { label: 'Récompense atteinte',      desc: 'Email envoyé dès que le client atteint le seuil',             icon: '🏆', color: 'bg-success-50 border-success-200 text-success-700' },
                { label: 'Proche de la récompense',   desc: 'Rappel quand il ne manque que 1-2 visites',                   icon: '🔔', color: 'bg-warning-50 border-warning-200 text-warning-700' },
                { label: 'Client inactif',             desc: 'Relance après 30 jours sans visite',                          icon: '😴', color: 'bg-gray-50 border-gray-200 text-gray-600' },
                { label: 'Expiration des points',      desc: 'Avertissement avant expiration des points/tampons',           icon: '⏰', color: 'bg-danger-50 border-danger-200 text-danger-700' },
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
            </div>

            {!isPro && onUpgrade && (
              <button onClick={onUpgrade} className="mt-5 w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
                Disponible avec le plan Pro
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════ SECTION 6 — Customization ═══════ */}
      {activeSection === 'customization' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Personnalisation du programme</h3>
            <p className="text-xs text-gray-400 mb-5">Adaptez le message et l&apos;apparence pour vos clients</p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Message de récompense</label>
                <input
                  type="text"
                  value={settings.reward_message}
                  onChange={e => update({ reward_message: e.target.value })}
                  placeholder="Ex : Bravo ! Votre récompense vous attend 🎉"
                  className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                />
              </div>

              {/* Preview: what client sees */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Aperçu du message client</p>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="max-w-xs mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                    <div className="bg-primary-600 px-4 py-3">
                      <p className="text-white text-xs font-semibold">Programme fidélité</p>
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
                          <p className="text-xs text-gray-500">7 / {settings.stamps_total} tampons</p>
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
                      <p className="text-xs text-gray-400 mt-3 italic">{settings.reward_message || 'Récompense offerte !'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced customization (Pro) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Apparence avancée
              <ProBadge />
            </h3>
            <p className="text-xs text-gray-400 mb-5">Personnalisez les couleurs, le thème et le logo de vos cartes</p>
            <ComingSoon />
          </div>
        </div>
      )}

      {/* ═══════ SECTION 7 — Summary ═══════ */}
      {activeSection === 'summary' && (
        <div className="space-y-5">
          {/* Active program summary */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-5">Programme actif</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-primary-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-primary-700 tabular-nums">
                  {settings.program_type === 'stamps' ? settings.stamps_total : settings.reward_threshold}
                </p>
                <p className="text-xs text-primary-600 mt-1">
                  {settings.program_type === 'stamps' ? 'Tampons par carte' : 'Points pour récompense'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {settings.program_type === 'stamps' ? '1' : settings.points_per_scan}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {settings.program_type === 'stamps' ? 'Tampon par scan' : 'Points par scan'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums capitalize">
                  {settings.program_type === 'stamps' ? 'Tampons' : 'Points'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Mode actif</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {settings.program_type === 'stamps'
                    ? settings.stamps_total
                    : Math.ceil(settings.reward_threshold / settings.points_per_scan)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Visites nécessaires</p>
              </div>
            </div>

            {/* Reward message preview */}
            <div className="mt-5 bg-success-50 rounded-xl p-4 border border-success-200">
              <p className="text-xs font-medium text-success-600 mb-1">Message de récompense</p>
              <p className="text-sm text-success-700 font-semibold">{settings.reward_message || 'Non configuré'}</p>
            </div>
          </div>

          {/* Live stats */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-gray-900 mb-5">Statistiques du programme</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {settings.program_type === 'stamps' ? (
                <>
                  <StatCard icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" label="Cartes complètes (ce mois)" value={cardsCompletedThisMonth} bg="bg-warning-50" text="text-warning-700" />
                  <StatCard icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" label="Tampons distribués (total)" value={stampsDistributed} bg="bg-success-50" text="text-success-700" />
                  <StatCard icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" label="Clients en cours de carte" value={clientsInProgress} bg="bg-primary-50" text="text-primary-700" />
                </>
              ) : (
                <>
                  <StatCard icon="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" label="Points distribués (total)" value={totalPointsDistributed} bg="bg-primary-50" text="text-primary-700" />
                  <StatCard icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" label="Clients proches récompense" value={nearRewardCount} bg="bg-success-50" text="text-success-700" />
                  <StatCard icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" label="Points en circulation" value={pointsInCirculation} bg="bg-purple-50" text="text-purple-700" />
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
            ? `${settings.stamps_total} tampons par carte · ${settings.reward_message || '—'}`
            : `${settings.points_per_scan} pt/scan · Seuil : ${settings.reward_threshold} pts · ${settings.reward_message || '—'}`}
        </p>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
        >
          {saving
            ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-ds-spin" />Sauvegarde...</>
            : <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Sauvegarder
              </>}
        </button>
      </div>
    </div>
  );
}

/* ─── Small stat card ───────────────────────────────────── */
function StatCard({ icon, label, value, bg, text }: { icon: string; label: string; value: number; bg: string; text: string }) {
  return (
    <div className={`${bg} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <svg className={`w-4 h-4 ${text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
        <p className={`text-xs ${text} opacity-75`}>{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${text}`}>{value.toLocaleString('fr-FR')}</p>
    </div>
  );
}
