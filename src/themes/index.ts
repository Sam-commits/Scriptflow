import { accentTokens } from './accents';
import { builtinThemes, night, paper } from './builtin';
import { APPEARANCE_CSS_KEY, AppearanceSettings } from './settings';
import { tagCss } from './tagColors';
import { TOKEN_NAMES, ThemeDef, ThemeMode, ThemeTokens, cssVar } from './types';

export * from './types';
export * from './settings';
export { accents } from './accents';
export { builtinThemes } from './builtin';
export { TAG_PALETTE, tagColorOn } from './tagColors';

export const themesFor = (mode: ThemeMode) => builtinThemes.filter((t) => t.mode === mode);

export function getTheme(id: string, mode: ThemeMode): ThemeDef {
  const t = builtinThemes.find((x) => x.id === id && x.mode === mode);
  return t ?? (mode === 'dark' ? night : paper);
}

/** Which mode is showing, given the settings and whether the OS is in dark mode. */
export function resolveMode(s: AppearanceSettings, systemDark: boolean): ThemeMode {
  return s.mode === 'system' ? (systemDark ? 'dark' : 'light') : s.mode;
}

/** A theme's tokens with the chosen accent applied. */
export function themeTokens(s: AppearanceSettings, mode: ThemeMode): ThemeTokens {
  const t = getTheme(mode === 'dark' ? s.darkTheme : s.lightTheme, mode);
  const acc = s.accent === 'theme' ? null : accentTokens(s.accent, mode);
  return acc ? { ...t.tokens, ...acc } : t.tokens;
}

export function tokensToCss(tokens: ThemeTokens, mode: ThemeMode): string {
  return TOKEN_NAMES.map((k) => `${cssVar(k)}:${tokens[k]}`).join(';') + `;${tagCss(tokens)};color-scheme:${mode}`;
}

/** Writes the theme onto <html> and caches both themes for the no-flash startup script. */
export function applyAppearance(s: AppearanceSettings, systemDark: boolean, root = document.documentElement): ThemeMode {
  const mode = resolveMode(s, systemDark);
  root.style.cssText = tokensToCss(themeTokens(s, mode), mode);
  root.dataset.theme = mode;
  try {
    localStorage.setItem(APPEARANCE_CSS_KEY, JSON.stringify({
      mode: s.mode, light: tokensToCss(themeTokens(s, 'light'), 'light'), dark: tokensToCss(themeTokens(s, 'dark'), 'dark'),
    }));
  } catch { /* storage blocked */ }
  return mode;
}
