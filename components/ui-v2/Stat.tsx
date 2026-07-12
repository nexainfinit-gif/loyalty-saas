import type { ReactNode } from 'react';

interface StatProps {
  label: string;
  value: ReactNode;
  /** Variation affichée sous la valeur (ex. « ▲ 12,4% »). */
  delta?: ReactNode;
  deltaDir?: 'up' | 'down' | 'none';
  /** Points de la sparkline sur une grille 120×26, ex. "0,20 20,18 …". */
  sparkPoints?: string;
  /** Couleur CSS du trait de la sparkline (défaut : accent). */
  sparkColor?: string;
}

/** Carte KPI du design system v2 : label, grande valeur, variation, sparkline. */
export function Stat({ label, value, delta, deltaDir = 'none', sparkPoints, sparkColor = 'var(--v2-a-600)' }: StatProps) {
  const deltaCls = deltaDir === 'up' ? 'v2-up' : deltaDir === 'down' ? 'v2-down' : '';
  return (
    <div className="v2-kpi">
      <div className="v2-kpi__lbl">{label}</div>
      <div className="v2-kpi__val">{value}</div>
      {delta && <div className={`v2-kpi__delta ${deltaCls}`}>{delta}</div>}
      {sparkPoints && (
        <svg className="v2-spark" viewBox="0 0 120 26" preserveAspectRatio="none" aria-hidden="true">
          <polyline fill="none" stroke={sparkColor} strokeWidth="2" points={sparkPoints} />
        </svg>
      )}
    </div>
  );
}
