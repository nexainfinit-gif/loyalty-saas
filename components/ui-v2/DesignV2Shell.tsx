'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark';

/**
 * Enveloppe racine du design system v2 : pose [data-ui-v2] (scope des tokens)
 * et gère le thème clair/sombre avec un toggle flottant. Le thème est résolu
 * depuis la préférence système au montage puis persisté en localStorage.
 */
export default function DesignV2Shell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = (localStorage.getItem('v2-theme') as Theme | null);
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  function toggle() {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('v2-theme', next);
      return next;
    });
  }

  return (
    <div data-ui-v2="" data-theme={theme} className="v2-root">
      {children}
      <button className="v2-toggle" onClick={toggle} aria-label="Basculer le thème clair/sombre">
        {theme === 'dark' ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            Clair
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
            Sombre
          </>
        )}
      </button>
    </div>
  );
}
