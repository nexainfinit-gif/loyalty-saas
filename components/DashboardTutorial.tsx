'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

type Tab = 'overview' | 'clients' | 'loyalty' | 'campaigns' | 'analytics' | 'settings';

interface TutorialStep {
  tab: Tab;
  title: string;
  description: string;
}

const STEPS: TutorialStep[] = [
  {
    tab: 'overview',
    title: "Vue d'ensemble",
    description: "Votre tableau de bord principal. Retrouvez vos KPIs clés, l'état de santé de votre activité et les actions recommandées.",
  },
  {
    tab: 'clients',
    title: 'Clients',
    description: "La liste complète de vos clients. Recherchez, filtrez par activité, consultez leurs points et exportez vos données en CSV.",
  },
  {
    tab: 'loyalty',
    title: 'Fidélité',
    description: "Configurez votre programme : points ou tampons, seuil de récompense, message personnalisé. Tout se règle ici.",
  },
  {
    tab: 'campaigns',
    title: 'Campagnes',
    description: "Envoyez des emails ciblés : relance des inactifs, anniversaires, offres spéciales. Choisissez un modèle ou créez le vôtre.",
  },
  {
    tab: 'analytics',
    title: 'Analytics',
    description: "Suivez vos performances : inscriptions, rétention, clients actifs. Les graphiques vous montrent ce qui fonctionne.",
  },
  {
    tab: 'settings',
    title: 'Paramètres',
    description: "Gérez votre commerce : nom, logo, couleur, lien d'inscription, QR code scanner et abonnement.",
  },
];

interface Props {
  onComplete: () => void;
  onTabChange: (tab: Tab) => void;
}

export default function DashboardTutorial({ onComplete, onTabChange }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  // Position tooltip next to the sidebar item
  const positionTooltip = useCallback(() => {
    const el = document.querySelector(`[data-tutorial-tab="${step.tab}"]`);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);

    // Place tooltip to the right of the sidebar item, vertically centered
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 200;
    let top = rect.top + rect.height / 2 - tooltipHeight / 2;

    // Keep tooltip within viewport
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    setTooltipPos({
      top,
      left: rect.right + 16,
    });
  }, [step.tab]);

  // Navigate tab + position tooltip on step change
  useEffect(() => {
    onTabChange(step.tab);
    // Small delay to let the tab render, then position
    const timer = setTimeout(positionTooltip, 80);
    return () => clearTimeout(timer);
  }, [currentStep, step.tab, onTabChange, positionTooltip]);

  // Reposition on resize
  useEffect(() => {
    window.addEventListener('resize', positionTooltip);
    return () => window.removeEventListener('resize', positionTooltip);
  }, [positionTooltip]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep(s => s + 1);
    }
  }, [isLast, onComplete]);

  return (
    <>
      {/* Full-screen overlay that blocks interaction */}
      <div
        className="fixed inset-0 z-[90] bg-gray-900/50 transition-opacity duration-300"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight cutout on the active sidebar item */}
      {highlightRect && (
        <div
          className="fixed z-[95] rounded-xl ring-4 ring-primary-400/50 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(17, 24, 39, 0.5)',
          }}
        />
      )}

      {/* Tooltip */}
      {tooltipPos && (
        <div
          ref={tooltipRef}
          className="fixed z-[100] w-80 animate-fade-up"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          {/* Arrow pointing left */}
          <div
            className="absolute -left-2 top-1/2 -translate-y-1/2 w-0 h-0"
            style={{
              borderTop: '8px solid transparent',
              borderBottom: '8px solid transparent',
              borderRight: '8px solid white',
            }}
          />

          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_16px_48px_rgba(0,0,0,0.15)] overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-primary-600 transition-all duration-300 ease-out"
                style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              />
            </div>

            <div className="p-5">
              {/* Step counter */}
              <p className="text-[11px] font-semibold text-primary-600 mb-1.5">
                Étape {currentStep + 1} sur {STEPS.length}
              </p>

              {/* Title */}
              <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>

              {/* Description */}
              <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
            </div>

            {/* Actions */}
            <div className="px-5 pb-4 flex items-center justify-between">
              <button
                onClick={onComplete}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Passer aux plans →
              </button>

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
                  className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                >
                  {isLast ? 'Commencer !' : 'Suivant →'}
                </button>
              </div>
            </div>

            {/* Step dots */}
            <div className="flex justify-center gap-1.5 pb-4">
              {STEPS.map((_, i) => (
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
