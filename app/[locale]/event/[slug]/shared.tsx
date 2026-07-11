'use client'

import type { EventTheme } from '@/lib/event-themes'

/**
 * Briques partagées des pages publiques Rebites Events :
 * liste de l'organisateur (page.tsx) et page d'un événement ([eventSlug]).
 * UNE page = UN thème — le mélange de thèmes sur une même page est interdit
 * (décision 2026-07-11) : chaque événement vit sur SA page, dans SON thème.
 */

export interface PubTier {
  id: string
  name: string
  description: string | null
  price: number
  kind: string
  seatsPerUnit: number
  remaining: number | null
}

export interface PubEvent {
  id: string
  title: string
  slug: string
  description: string | null
  location: string | null
  starts_at: string
  price: number
  remaining: number | null
  offer_loyalty: boolean
  theme?: string
  tiers: PubTier[]
}

export interface PubBusiness {
  name: string
  city: string | null
  primaryColor: string | null
  logoUrl: string | null
}

/** Classes CSS d'un thème, suffixées par sa clé. */
export function themeCss(T: EventTheme): string {
  const k = T.key
  return `
    .ev-display-${k} {
      font-family: ${T.display};
      font-weight: ${T.displayWeight};
      ${T.displayItalic ? 'font-style: italic;' : ''}
      ${T.displayUppercase ? 'text-transform: uppercase;' : ''}
      ${T.displayTracking ? `letter-spacing: ${T.displayTracking};` : ''}
    }
    .ev-card-${k} {
      background: ${T.surface}; border: ${T.dark ? '2px' : '1px'} solid ${T.border};
      ${T.variant === 'catalog' ? `border-top: 5px solid ${T.ink};` : ''}
      border-radius: ${T.radius};
      box-shadow: ${T.shadow};
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }
    .ev-card-${k}:hover {
      ${T.dark ? `transform: translate(-2px, -2px); border-color: ${T.accent};` : 'transform: translateY(-2px);'}
      box-shadow: ${T.shadowHover};
    }
    .ev-btn-${k} {
      background: ${T.accent}; color: ${T.accentInk};
      border: ${T.dark ? `2px solid ${T.accent}` : '1px solid transparent'};
      border-radius: ${T.radius};
      ${T.dark ? 'box-shadow: 5px 5px 0 #000;' : ''}
      transition: all 0.15s ease;
    }
    .ev-btn-${k}:hover:not(:disabled) {
      ${T.dark
        ? `transform: translate(-2px, -2px); box-shadow: 7px 7px 0 ${T.accent2};`
        : `filter: brightness(1.12); box-shadow: ${T.shadowHover};`}
    }
    .ev-btn-${k}:active:not(:disabled) { ${T.dark ? 'transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000;' : 'transform: translateY(1px);'} }
    .ev-input-${k} {
      background: ${T.dark ? T.bg : T.surface};
      border: ${T.dark ? '2px' : '1px'} solid ${T.dark ? '#2e2e38' : T.border};
      color: ${T.ink}; border-radius: ${T.radius};
    }
    .ev-input-${k}:focus { outline: none; border-color: ${T.accent}; ${T.dark ? 'box-shadow: 4px 4px 0 rgba(200,255,46,0.25);' : `box-shadow: 0 0 0 3px ${T.accent}22;`} }
    .ev-input-${k}::placeholder { color: ${T.faint}; }
    /* Police des labels propre au thème (mono technique ou sans produit) */
    .ev-card-${k} .ev-mono { font-family: ${T.labelFamily}; }
  `
}

/** Styles de la page — UN seul thème par page. */
export function PageStyles({ shell }: { shell: EventTheme }) {
  return (
    <style>{`
      @import url('${shell.fontImport}');
      body { background: ${shell.bg}; }
      .ev-mono { font-family: ${shell.labelFamily}; }
      .ev-bg { background: ${shell.bg}; position: relative; overflow-x: hidden; }
      ${shell.grain ? `
      .ev-bg::before {
        content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
        opacity: 0.05;
      }` : ''}
      ${shell.vibe ? `
      .ev-vibe {
        position: fixed; width: 60vmax; height: 60vmax; border-radius: 50%;
        filter: blur(90px); opacity: 0.32; z-index: 0; pointer-events: none;
        background: ${shell.vibe};
        animation: ev-drift 22s ease-in-out infinite alternate;
        top: -20vmax; right: -20vmax;
      }
      @keyframes ev-drift {
        0%   { transform: translate(0, 0) rotate(0deg) scale(1); }
        100% { transform: translate(-16vmax, 24vmax) rotate(50deg) scale(1.18); }
      }` : '.ev-vibe { display: none; }'}
      @keyframes ev-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .ev-marquee-track { animation: ev-marquee 22s linear infinite; }
      @keyframes ev-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
      .ev-up { animation: ev-up 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
      .ev-stub-code {
        background: ${shell.dark ? '#F4F4F6' : shell.headerBg};
        color: ${shell.dark ? '#0B0B10' : '#FFFFFF'};
        border-radius: ${shell.radius};
        ${shell.dark ? `border: 2px solid #F4F4F6; box-shadow: 5px 5px 0 ${shell.accent2};` : `box-shadow: ${shell.shadow};`}
        transition: all 0.15s ease; display: block;
      }
      .ev-stub-code:hover { ${shell.dark ? `transform: translate(-2px, -2px); box-shadow: 7px 7px 0 ${shell.accent};` : `box-shadow: ${shell.shadowHover}; transform: translateY(-2px);`} }
      ${themeCss(shell)}
    `}</style>
  )
}

/** Bandeau marquee (nuit) ou filet éditorial (thèmes clairs). */
export function TopBand({ T }: { T: EventTheme }) {
  if (T.band === 'none') return null
  if (!T.marquee) {
    return <div className="relative z-10 h-1.5" style={{ background: `linear-gradient(90deg, ${T.accent}, ${T.accent2})` }} />
  }
  const chunk = Array.from({ length: 10 }, (_, i) => (
    <span key={i} className="ev-mono text-[11px] font-bold tracking-[0.25em] uppercase mx-4" style={{ color: T.accentInk }}>
      Rebites Events <span className="mx-2">✦</span>
    </span>
  ))
  return (
    <div className="relative z-10 overflow-hidden py-1.5 border-b-2 border-black" style={{ background: T.accent }}>
      <div className="ev-marquee-track flex whitespace-nowrap w-max">{chunk}{chunk}</div>
    </div>
  )
}

/** Loader NEUTRE (sans thème) — le thème réel n'est pas encore connu. */
export function NeutralLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
      <style>{`@keyframes ev-neutral-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #ececec', borderTopColor: '#111', animation: 'ev-neutral-spin 0.7s linear infinite' }} />
    </div>
  )
}
