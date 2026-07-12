import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** Bouton du design system v2. Variantes : primary / secondary / ghost / danger. */
export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonProps) {
  const cls = `v2-btn v2-btn--${size} v2-btn--${variant}${className ? ` ${className}` : ''}`;
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
