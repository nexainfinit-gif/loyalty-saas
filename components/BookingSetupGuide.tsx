'use client';
import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';

/**
 * Guide de configuration des réservations, suite du tutoriel dashboard pour
 * les métiers à rendez-vous : prestations → équipe → réglages & partage.
 * Le commerçant configure RÉELLEMENT chaque écran ; la carte flottante le
 * suit de page en page (état dans localStorage, aucune migration).
 */
const LS_KEY = 'rebites_booking_setup';

type GuideStep = 'services' | 'staff' | 'settings';

// localStorage comme source de vérité (useSyncExternalStore : pas de setState
// dans un effet — règle lint — et rendu serveur = guide masqué).
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function readStep(): GuideStep | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === 'services' || v === 'staff' || v === 'settings' ? v : null;
  } catch { return null; }
}
function writeStep(v: GuideStep | null) {
  try {
    if (v) localStorage.setItem(LS_KEY, v);
    else localStorage.removeItem(LS_KEY);
  } catch { /* navigation privée */ }
  listeners.forEach(l => l());
}

const STEPS: { id: GuideStep; path: string; titleKey: string; descKey: string }[] = [
  { id: 'services', path: '/dashboard/appointments/services', titleKey: 'bookingSetup.servicesTitle', descKey: 'bookingSetup.servicesDesc' },
  { id: 'staff',    path: '/dashboard/appointments/staff',    titleKey: 'bookingSetup.staffTitle',    descKey: 'bookingSetup.staffDesc' },
  { id: 'settings', path: '/dashboard/appointments/settings', titleKey: 'bookingSetup.settingsTitle', descKey: 'bookingSetup.settingsDesc' },
];

export default function BookingSetupGuide() {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const pathname = usePathname();
  const stepId = useSyncExternalStore(subscribe, readStep, () => null);

  if (!stepId) return null;

  const idx = STEPS.findIndex(s => s.id === stepId);
  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;
  // Le commerçant est-il sur la page de l'étape courante ?
  const onStepPage = pathname?.endsWith(step.path) ?? false;

  const quit = () => writeStep(null);

  const advance = () => {
    if (!onStepPage) {
      router.push(step.path);
      return;
    }
    if (isLast) {
      quit();
      return;
    }
    const next = STEPS[idx + 1];
    writeStep(next.id);
    router.push(next.path);
  };

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 z-40 animate-fade-up">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_16px_48px_rgba(0,0,0,0.15)] overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-primary-600 transition-all duration-300 ease-out"
            style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-4">
          <p className="text-[11px] font-semibold text-primary-600 mb-1">
            {t('bookingSetup.badge')} · {t('tutorial.stepOf', { current: idx + 1, total: STEPS.length })}
          </p>
          <h3 className="text-sm font-bold text-gray-900 mb-1.5">{t(step.titleKey)}</h3>
          <p className="text-[13px] text-gray-500 leading-relaxed">{t(step.descKey)}</p>

          <div className="flex items-center justify-between mt-3">
            <button
              onClick={quit}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t('bookingSetup.quit')}
            </button>
            <button
              onClick={advance}
              className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-colors"
            >
              {!onStepPage
                ? t('bookingSetup.goThere')
                : isLast ? t('bookingSetup.finish') : t('bookingSetup.next')}
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={[
                'h-1.5 rounded-full transition-all duration-300',
                i === idx ? 'bg-primary-600 w-4' : i < idx ? 'bg-primary-300 w-1.5' : 'bg-gray-200 w-1.5',
              ].join(' ')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
