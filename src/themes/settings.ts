import { ThemeMode } from './types';

/** How the editor looks. Saved per browser; never affects exported scripts. */
export interface AppearanceSettings {
  version: 1;
  /** 'system' follows the OS light/dark setting. */
  mode: 'system' | ThemeMode;
  lightTheme: string;
  darkTheme: string;
  /** An accent id from accents.ts, or 'theme' for each theme's own accent. */
  accent: string;
  /** 0.5 to 2, or 'fit' to fill the window width. */
  zoom: number | 'fit';
  /** paged: separate sheets; continuous: one sheet with break lines; draft: no page edges. */
  pageView: 'paged' | 'continuous' | 'draft';
  pageNumbers: boolean;
  pageShadow: boolean;
  /** Highlight tagged breakdown elements in the script. */
  showTags: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  version: 1, mode: 'system', lightTheme: 'paper', darkTheme: 'night', accent: 'theme',
  zoom: 1, pageView: 'paged', pageNumbers: true, pageShadow: true, showTags: true,
};

export const APPEARANCE_KEY = 'scriptflow:appearance';
/** Resolved CSS for the saved light and dark themes, read by the inline script in index.html. */
export const APPEARANCE_CSS_KEY = 'scriptflow:appearance-css';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return normalize(JSON.parse(raw));
  } catch { return DEFAULT_APPEARANCE; }
}

export function saveAppearance(s: AppearanceSettings) {
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

/** Fill in missing or invalid fields so older or hand-edited settings still load. */
export function normalize(v: Partial<AppearanceSettings> | null | undefined): AppearanceSettings {
  const d = DEFAULT_APPEARANCE;
  const s = v && typeof v === 'object' ? v : {};
  const pick = <T,>(x: unknown, ok: readonly T[], fb: T) => (ok.includes(x as T) ? (x as T) : fb);
  const zoom = s.zoom === 'fit' ? 'fit'
    : typeof s.zoom === 'number' && isFinite(s.zoom) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s.zoom)) : d.zoom;
  return {
    version: 1,
    mode: pick(s.mode, ['system', 'light', 'dark'] as const, d.mode),
    lightTheme: typeof s.lightTheme === 'string' ? s.lightTheme : d.lightTheme,
    darkTheme: typeof s.darkTheme === 'string' ? s.darkTheme : d.darkTheme,
    accent: typeof s.accent === 'string' ? s.accent : d.accent,
    zoom,
    pageView: pick(s.pageView, ['paged', 'continuous', 'draft'] as const, d.pageView),
    pageNumbers: typeof s.pageNumbers === 'boolean' ? s.pageNumbers : d.pageNumbers,
    pageShadow: typeof s.pageShadow === 'boolean' ? s.pageShadow : d.pageShadow,
    showTags: typeof s.showTags === 'boolean' ? s.showTags : d.showTags,
  };
}
