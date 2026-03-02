import { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'vip' | 'scheduled';

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success:   'bg-success-50  text-success-700',
  warning:   'bg-warning-100 text-warning-700',
  danger:    'bg-danger-50   text-danger-700',
  info:      'bg-primary-50  text-primary-700',
  neutral:   'bg-gray-100    text-gray-600',
  vip:       'bg-vip-50      text-vip-700',
  scheduled: 'bg-primary-50  text-primary-700',
};

export function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
