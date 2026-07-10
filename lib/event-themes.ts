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
  /** Interlettrage des titres (ex. '-0.03em' pour un grotesk serré). */
  displayTracking?: string;
  /** Couleurs. */
  bg: string;         // fond de page
  surface: string;    // cartes
  headerBg: string;   // en-tête du billet
  /** Texte posé sur headerBg (défaut blanc — utile si en-tête clair). */
  headerInk?: string;
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
  /** Variante STRUCTURELLE des cartes : 'catalog' = cartel d'exposition
   *  (filet épais, № numéroté, pas de bloc date) au lieu du billet-affiche. */
  variant?: 'catalog';
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
  /** Conférences, séminaires, lancements — style suisse international :
   *  papier blanc, grotesk serré, bleu Klein électrique + rouge affiche,
   *  filets hairline, angles nets. */
  corporate: {
    key: 'corporate',
    fontImport: 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;800;900&display=swap',
    display: "'Archivo', 'Helvetica Neue', Arial, sans-serif",
    displayWeight: 800,
    displayItalic: false,
    displayUppercase: true,
    displayTracking: '-0.02em',
    bg: '#FAFAF8',
    surface: '#FFFFFF',
    headerBg: '#101010',
    ink: '#101010',
    muted: '#55565A',
    faint: '#9B9C9F',
    accent: '#1F3AFF',
    accentInk: '#FFFFFF',
    accent2: '#E63312',
    border: '#E4E4E0',
    dark: false,
    radius: '0px',
    shadow: '0 0 0 rgba(0,0,0,0)',
    shadowHover: '0 12px 32px rgba(16,16,16,0.10)',
    grain: false,
    vibe: null,
    marquee: false,
  },
  /** Musées, expos, ateliers culturels — cartel d'exposition : serif
   *  éditorial italique XXL, filets épais, № numérotés, carton crème. */
  musee: {
    key: 'musee',
    fontImport: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,650;1,9..144,500;1,9..144,650&display=swap',
    display: "'Fraunces', Georgia, serif",
    displayWeight: 650,
    displayItalic: true,
    displayUppercase: false,
    displayTracking: '-0.01em',
    bg: '#F7F3EA',
    surface: '#FFFDF8',
    headerBg: '#EFE7D5',
    headerInk: '#1C1917',
    ink: '#1C1917',
    muted: '#6E675E',
    faint: '#A39B8D',
    accent: '#B2451F',
    accentInk: '#FFFDF8',
    accent2: '#1C1917',
    border: '#DDD3BF',
    dark: false,
    radius: '0px',
    shadow: '0 1px 0 rgba(28,25,23,0.10)',
    shadowHover: '0 16px 38px rgba(28,25,23,0.13)',
    grain: false,
    vibe: null,
    marquee: false,
    variant: 'catalog',
  },
};

export function resolveEventTheme(key: unknown): EventTheme {
  return EVENT_THEMES[(key as EventThemeKey) in EVENT_THEMES ? (key as EventThemeKey) : 'nuit'];
}
