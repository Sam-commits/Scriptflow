import { TAG_CATEGORIES } from '../tags/categories';
import { ThemeTokens } from './types';

/**
 * Tag highlight colors, one pair per breakdown category: a deeper shade for
 * light surfaces and a brighter one for dark surfaces. Which one a theme uses
 * depends on the surface itself, not the mode, so Dark Desk (dark workspace,
 * white page) gets dark-on-white tags on the page and bright chips in the panel.
 */
export const TAG_PALETTE: Record<string, { light: string; dark: string }> = {
  cast: { light: '#c81e1e', dark: '#f87171' },
  extras: { light: '#b4470a', dark: '#fb923c' },
  props: { light: '#7c3aed', dark: '#a78bfa' },
  wardrobe: { light: '#a21caf', dark: '#e879f9' },
  makeup: { light: '#be185d', dark: '#f472b6' },
  locations: { light: '#15803d', dark: '#4ade80' },
  set: { light: '#4d6b0f', dark: '#a3e635' },
  vehicles: { light: '#1d4ed8', dark: '#60a5fa' },
  animals: { light: '#8a5a00', dark: '#facc15' },
  effects: { light: '#0e7490', dark: '#22d3ee' },
  stunts: { light: '#475569', dark: '#cbd5e1' },
  sound: { light: '#4338ca', dark: '#a5b4fc' },
  shots: { light: '#0f766e', dark: '#5eead4' },
};

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const hex = (c: number[]) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');

/** `a` laid over `b` at the given opacity, as a solid color. */
export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v * amount + y[i] * (1 - amount)));
}

export function isDarkSurface(color: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
  const [r, g, b] = rgb(color);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** Highlight strength behind tagged text: enough to see, light enough to read through. */
const SOFT = { light: 0.16, dark: 0.26 };

export interface TagColor {
  /** Underline and dot color. */
  strong: string;
  /** Background behind tagged text. */
  soft: string;
}

export function tagColorOn(category: string, surface: string): TagColor {
  const p = TAG_PALETTE[category] ?? TAG_PALETTE.props;
  const dark = isDarkSurface(surface);
  const strong = dark ? p.dark : p.light;
  return { strong, soft: mix(strong, surface, dark ? SOFT.dark : SOFT.light) };
}

/**
 * CSS variables for every category: `--tag-props` / `--tag-props-soft` for the
 * page, and `--tag-props-ui` / `--tag-props-ui-soft` for the workspace (panels,
 * and the page in Draft view, which sits straight on the workspace).
 */
export function tagCss(tokens: ThemeTokens): string {
  return TAG_CATEGORIES.map(({ id }) => {
    const page = tagColorOn(id, tokens.page);
    const ui = tagColorOn(id, tokens.panel);
    const bg = tagColorOn(id, tokens.bg);
    return `--tag-${id}:${page.strong};--tag-${id}-soft:${page.soft};--tag-${id}-ui:${ui.strong};--tag-${id}-ui-soft:${bg.soft}`;
  }).join(';');
}
