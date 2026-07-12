import type { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
}

/** Conteneur surface du design system v2 (filet 1px + ombre quasi nulle). */
export function Card({ className = '', children }: CardProps) {
  return <div className={`v2-card${className ? ` ${className}` : ''}`}>{children}</div>;
}

interface CardHeaderProps {
  title: ReactNode;
  /** Zone d'actions à droite (segmented control, bouton…). */
  actions?: ReactNode;
}

/** En-tête de carte : titre à gauche, actions à droite. */
export function CardHeader({ title, actions }: CardHeaderProps) {
  return (
    <div className="v2-card__head">
      <h3>{title}</h3>
      {actions}
    </div>
  );
}
