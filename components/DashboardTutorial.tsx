'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';

type Tab = 'overview' | 'clients' | 'loyalty' | 'campaigns' | 'analytics' | 'settings';

interface TutorialStep {
  tab: Tab;
  titleKey: string;
  descKey: string;
  /** Étape interactive : le voile ne bloque pas, le commerçant manipule
   *  réellement l'écran (identité, programme de fidélité…). */
  interactive?: boolean;
  /** Étape finale « réservations » (métiers éligibles) : ancre = le lien
   *  sidebar Booking, bouton principal = départ du guide de configuration. */
  booking?: boolean;
  /** Étape verrouillante : Suivant reste désactivé (et Passer masqué) tant
   *  que la configuration n'est pas réellement faite. */
  gate?: 'identity';
}

interface Props {
  onComplete: () => void;
  onTabChange: (tab: Tab) => void;
  /** Métier à rendez-vous (salon, institut…) avec le booking actif sur le
   *  plan : ajoute l'étape finale qui enchaîne sur le guide prestations →
   *  équipe → réglages. */
  bookingEligible?: boolean;
  onStartBooking?: () => void;
  /** Identité configurée (logo uploadé) — déverrouille l'étape 1. */
  identityDone?: boolean;
  /** Produit fidélité actif (T0) : sans lui, les étapes fidélité/clients
   *  sont retirées du parcours (organisateur d'événements pur). */
  loyaltyEnabled?: boolean;
}

export default function DashboardTutorial({ onComplete, onTabChange, bookingEligible, onStartBooking, identityDone, loyaltyEnabled = true }: Props) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Parcours : d'abord les deux configurations essentielles EN DIRECT
  // (identité puis programme de fidélité — sa carte Wallet naît au save),
  // ensuite la visite rapide, et pour les métiers à rendez-vous l'étape
  // qui lance le guide de configuration des réservations.
  const steps = useMemo<TutorialStep[]>(() => {
    const s: TutorialStep[] = [
      { tab: 'settings',   titleKey: 'tutorial.identityTitle',   descKey: 'tutorial.identityDesc', interactive: true, gate: 'identity' },
      ...(loyaltyEnabled ? [
        { tab: 'loyalty' as Tab, titleKey: 'tutorial.loyaltyTitle', descKey: 'tutorial.loyaltyDesc', interactive: true },
      ] : []),
      { tab: 'overview',   titleKey: 'tutorial.overviewTitle',   descKey: 'tutorial.overviewDesc' },
      ...(loyaltyEnabled ? [
        { tab: 'clients' as Tab, titleKey: 'tutorial.clientsTitle', descKey: 'tutorial.clientsDesc' },
      ] : []),
      { tab: 'campaigns',  titleKey: 'tutorial.campaignsTitle',  descKey: 'tutorial.campaignsDesc' },
      { tab: 'analytics',  titleKey: 'tutorial.analyticsTitle',  descKey: 'tutorial.analyticsDesc' },
    ];
    if (bookingEligible) {
      s.push({ tab: 'analytics', titleKey: 'tutorial.bookingTitle', descKey: 'tutorial.bookingDesc', booking: true });
    }
    return s;
  }, [bookingEligible, loyaltyEnabled]);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  // Étape verrouillée : la configuration attendue n'est pas encore faite.
  const gated = step.gate === 'identity' && !identityDone;

  // Position tooltip next to the sidebar item (or below on mobile)
  const positionTooltip = useCallback(() => {
    const el = document.querySelector(
      step.booking ? '[data-tutorial-booking]' : `[data-tutorial-tab="${step.tab}"]`,
    );

    // Étape interactive : la carte est ANCRÉE en bas à droite (via CSS) pour
    // ne jamais recouvrir le formulaire à remplir — on ne calcule que l'anneau.
    if (step.interactive) {
      setHighlightRect(el ? el.getBoundingClientRect() : null);
      setTooltipPos(null);
      return;
    }

    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 200;
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 320;
    const vw = window.innerWidth;

    if (!el) {
      // Ancre absente (ex. sidebar repliée) : tooltip centré, pas de spotlight.
      setHighlightRect(null);
      setTooltipPos({
        top: Math.max(16, (window.innerHeight - tooltipHeight) / 2),
        left: Math.max(12, (vw - tooltipWidth) / 2),
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);

    if (vw < 1024) {
      // Mobile: center tooltip horizontally, position below the element
      const left = Math.max(12, Math.min((vw - tooltipWidth) / 2, vw - tooltipWidth - 12));
      setTooltipPos({
        top: rect.bottom + 12,
        left,
      });
    } else {
      // Desktop: to the right of the sidebar item, vertically centered
      let top = rect.top + rect.height / 2 - tooltipHeight / 2;
      top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));
      setTooltipPos({
        top,
        left: rect.right + 16,
      });
    }
  }, [step.tab, step.booking, step.interactive]);

  // Navigate tab + position tooltip on step change
  useEffect(() => {
    if (!step.booking) onTabChange(step.tab);
    // Small delay to let the tab render, then position
    const timer = setTimeout(positionTooltip, 80);
    return () => clearTimeout(timer);
  }, [currentStep, step.tab, step.booking, onTabChange, positionTooltip]);

  // Reposition on resize
  useEffect(() => {
    window.addEventListener('resize', positionTooltip);
    return () => window.removeEventListener('resize', positionTooltip);
  }, [positionTooltip]);

  // Étape interactive : le voile est transparent pour laisser configurer,
  // mais on bloque toute ÉCHAPPATOIRE — seuls le contenu principal (<main>)
  // et la carte du tutoriel restent cliquables (sidebar, Scanner QR, Studio
  // Wallet, nav mobile, déconnexion : verrouillés).
  useEffect(() => {
    if (!step.interactive) return;
    const block = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('main') || target.closest('[data-tutorial-card]'))) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', block, true);
    document.addEventListener('click', block, true);
    return () => {
      document.removeEventListener('pointerdown', block, true);
      document.removeEventListener('click', block, true);
    };
  }, [step.interactive]);

  const handleNext = useCallback(() => {
    if (gated) return;
    if (isLast) {
      if (step.booking && onStartBooking) onStartBooking();
      else onComplete();
    } else {
      setCurrentStep(s => s + 1);
    }
  }, [gated, isLast, step.booking, onStartBooking, onComplete]);

  return (
    <>
      {/* Full-screen overlay.
          - Étape normale : voile sombre qui bloque toute interaction.
          - Étape interactive (identité, fidélité) : transparent +
            pointer-events-none → le commerçant remplit/enregistre en direct. */}
      <div
        className={[
          'fixed inset-0 z-[90] transition-opacity duration-300',
          step.interactive ? 'bg-transparent pointer-events-none' : 'bg-gray-900/50',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight cutout on the active sidebar item.
          Sur une étape interactive, on retire le voile plein écran (box-shadow)
          pour que le contenu reste bien visible et cliquable. */}
      {highlightRect && (
        <div
          className="fixed z-[95] rounded-xl ring-4 ring-primary-400/60 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            boxShadow: step.interactive ? 'none' : '0 0 0 9999px rgba(17, 24, 39, 0.5)',
          }}
        />
      )}

      {/* Tooltip — étape interactive : docké en bas à droite (l'écran reste
          entièrement libre pour la configuration) ; sinon accroché à l'ancre. */}
      {(tooltipPos || step.interactive) && (
        <div
          ref={tooltipRef}
          data-tutorial-card
          className={[
            'fixed z-[100] w-[calc(100vw-24px)] sm:w-80 max-w-80 animate-fade-up',
            step.interactive ? 'bottom-4 right-3 sm:right-4' : '',
          ].join(' ')}
          style={step.interactive ? undefined : { top: tooltipPos!.top, left: tooltipPos!.left }}
        >
          {/* Arrow — points left on desktop, up on mobile */}
          {highlightRect && !step.interactive && (
            <>
              <div
                className="absolute w-0 h-0 hidden lg:block -left-2 top-1/2 -translate-y-1/2"
                style={{
                  borderTop: '8px solid transparent',
                  borderBottom: '8px solid transparent',
                  borderRight: '8px solid white',
                }}
              />
              <div
                className="absolute w-0 h-0 lg:hidden left-1/2 -translate-x-1/2 -top-2"
                style={{
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderBottom: '8px solid white',
                }}
              />
            </>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_16px_48px_rgba(0,0,0,0.15)] overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-primary-600 transition-all duration-300 ease-out"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>

            <div className="p-5">
              {/* Step counter */}
              <p className="text-[11px] font-semibold text-primary-600 mb-1.5">
                {t('tutorial.stepOf', { current: currentStep + 1, total: steps.length })}
              </p>

              {/* Title */}
              <h3 className="text-base font-bold text-gray-900 mb-2">{t(step.titleKey)}</h3>

              {/* Description */}
              <p className="text-sm text-gray-500 leading-relaxed">{t(step.descKey)}</p>

              {/* Verrou : ce qu'il reste à faire pour continuer / confirmation */}
              {step.gate === 'identity' && (
                gated ? (
                  <p className="mt-2.5 text-xs font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                    {t('tutorial.gateIdentity')}
                  </p>
                ) : (
                  <p className="mt-2.5 text-xs font-medium text-success-700 bg-success-50 rounded-xl px-3 py-2">
                    {t('tutorial.gateIdentityDone')}
                  </p>
                )
              )}
            </div>

            {/* Actions */}
            <div className="px-5 pb-4 flex items-center justify-between">
              {/* Passer : masqué tant qu'une étape verrouillante est incomplète
                  — la configuration fait partie du tutoriel, pas d'échappatoire. */}
              {gated ? <span /> : (
                <button
                  onClick={onComplete}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {t('tutorial.skip')}
                </button>
              )}

              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={() => setCurrentStep(s => s - 1)}
                    className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    ←
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={gated}
                  className={[
                    'px-4 py-2 text-xs font-semibold rounded-xl transition-colors',
                    gated
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-gray-800',
                  ].join(' ')}
                >
                  {isLast ? (step.booking ? t('tutorial.bookingCta') : t('tutorial.start')) : t('tutorial.nextBtn')}
                </button>
              </div>
            </div>

            {/* Step dots */}
            <div className="flex justify-center gap-1.5 pb-4">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={[
                    'h-1.5 rounded-full transition-all duration-300',
                    i === currentStep ? 'bg-primary-600 w-4' : i < currentStep ? 'bg-primary-300 w-1.5' : 'bg-gray-200 w-1.5',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
