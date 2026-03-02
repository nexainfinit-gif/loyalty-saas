import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingMap = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };

export function Card({ children, className = '', padding = 'md', hover = false }: CardProps) {
  return (
    <div
      className={[
        'bg-white rounded-2xl border border-gray-100',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)]',
        hover ? 'transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]' : '',
        paddingMap[padding],
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-5 py-4 border-b border-gray-100 ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}
