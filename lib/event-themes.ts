/**
 * Thèmes des pages publiques Rebites Events (listing + billet).
 * Choisi PAR ORGANISATEUR dans le dashboard (KV `events_theme`) : un concert
 * et un séminaire d'entreprise ne se présentent pas pareil.
 * Module client-safe — uniquement des tokens.
 */
export type EventThemeKey = 'nuit' | 'corporate' | 'musee';

export interface EventTheme {
  key: EventThemeKey;
  /** URL Google Fonts à importer. */
  fontImport: string;
  /** Famille display (titres). */
  display: string;
  /** Style des titres. */
  displayWeight: number;
  displayItalic: boolean;
  displayUppercase: boolean;
  /** Couleurs. */
  bg: string;         // fond de page
  surface: string;    // cartes
  headerBg: string;   // en-tête du billet
  ink: string;        // texte principal (sur bg/surface)
  muted: string;      // texte secondaire
  faint: string;      // texte discret
  accent: string;     // CTA / temps forts
  accentInk: string;  // texte posé sur accent
  accent2: string;    // second accent (alertes, hover)
  border: string;
  /** Traits de caractère. */
  dark: boolean;      // thème sombre (inputs, contrastes)
  radius: string;     // arrondi des blocs
  shadow: string;     // ombre des cartes
  shadowHover: string;
  grain: boolean;     // texture bruit
  vibe: string | null; // fond d'ambiance (css background) ou null
  marquee: boolean;   // bandeau défilant
}

export const EVENT_THEMES: Record<EventThemeKey, EventTheme> = {
  /** Concerts, clubs, festivals — poster-brutalisme nocturne. */
  nuit: {
    key: 'nuit',
    fontImport: 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&display=swap',
    display: "'Unbounded', system-ui, sans-serif",
    displayWeight: 900,
    displayItalic: false,
    displayUppercase: true,
    bg: '#0B0B10',
    surface: '#131318',
    headerBg: '#0B0B10',
    ink: '#F4F4F6',
    muted: '#9a9aa4',
    faint: '#56565f',
    accent: '#C8FF2E',
    accentInk: '#0B0B10',
    accent2: '#FF3EA5',
    border: '#26262e',
    dark: true,
    radius: '0px',
    shadow: '6px 6px 0 #000',
    shadowHover: '9px 9px 0 #C8FF2E',
    grain: true,
    vibe: 'radial-gradient(circle at 30% 30%, #C8FF2E, transparent 55%), radial-gradient(circle at 70% 70%, #FF3EA5, transparent 55%), radial-gradient(circle at 60% 20%, #4F6BED, transparent 45%)',
    marquee: true,
  },
  /** Conférences, séminaires, lancements — clair raffiné marine + bronze. */
  corporate: {
    key: 'corporate',
    fontImport: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap',
    display: "'Fraunces', Georgia, serif",
    displayWeight: 700,
    displayItalic: false,
    displayUppercase: false,
    bg: '#F6F5F1',
    surface: '#FFFFFF',
    headerBg: '#16202B',
    ink: '#16202B',
    muted: '#5F6B76',
    faint: '#9AA3AC',
    accent: '#1E3A5F',
    accentInk: '#FFFFFF',
    accent2: '#A3763B',
    border: '#E3E0D8',
    dark: false,
    radius: '4px',
    shadow: '0 1px 2px rgba(22,32,43,0.06)',
    shadowHover: '0 10px 30px rgba(22,32,43,0.12)',
    grain: false,
    vibe: null,
    marquee: false,
  },
  /** Musées, expos, ateliers culturels — blanc galerie + terracotta. */
  musee: {
    key: 'musee',
    fontImport: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&display=swap',
    display: "'Cormorant Garamond', Georgia, serif",
    displayWeight: 700,
    displayItalic: true,
    displayUppercase: false,
    bg: '#FAF7F1',
    surface: '#FFFFFF',
    headerBg: '#1C1917',
    ink: '#1C1917',
    muted: '#78716C',
    faint: '#A8A29E',
    accent: '#BC4A22',
    accentInk: '#FFFFFF',
    accent2: '#1C1917',
    border: '#E7E0D2',
    dark: false,
    radius: '0px',
    shadow: '0 1px 0 rgba(28,25,23,0.08)',
    shadowHover: '0 14px 34px rgba(28,25,23,0.12)',
    grain: false,
    vibe: null,
    marquee: false,
  },
};

export function resolveEventTheme(key: unknown): EventTheme {
  return EVENT_THEMES[(key as EventThemeKey) in EVENT_THEMES ? (key as EventThemeKey) : 'nuit'];
}
