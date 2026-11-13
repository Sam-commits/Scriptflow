import { ThemeMode, ThemeTokens } from './types';

type AccentTokens = Pick<ThemeTokens, 'accent' | 'accentSoft' | 'onAccent'>;

export interface AccentDef { id: string; name: string; light: AccentTokens; dark: AccentTokens }

const L = (accent: string, accentSoft: string): AccentTokens => ({ accent, accentSoft, onAccent: '#ffffff' });
const D = (accent: string, accentSoft: string): AccentTokens => ({ accent, accentSoft, onAccent: '#14110c' });

/** 'theme' keeps each theme's own accent; the rest override it. */
export const accents: AccentDef[] = [
  { id: 'orange', name: 'Orange', light: L('#b43c0b', '#fde8dc'), dark: D('#fb923c', '#3b2417') },
  { id: 'red', name: 'Red', light: L('#b91c1c', '#fde2e2'), dark: D('#f87171', '#3b1a1a') },
  { id: 'rose', name: 'Rose', light: L('#be123c', '#ffe4e9'), dark: D('#fb7185', '#3b1622') },
  { id: 'violet', name: 'Violet', light: L('#6d28d9', '#ede5ff'), dark: D('#a78bfa', '#2a2140') },
  { id: 'blue', name: 'Blue', light: L('#1d4ed8', '#e0e9ff'), dark: D('#60a5fa', '#172a42') },
  { id: 'teal', name: 'Teal', light: L('#0f766e', '#d5f5f0'), dark: D('#2dd4bf', '#11312e') },
  { id: 'green', name: 'Green', light: L('#137337', '#dcf5e3'), dark: D('#4ade80', '#15301f') },
  { id: 'gold', name: 'Gold', light: L('#8f5706', '#fbefd0'), dark: D('#facc15', '#33290f') },
];

export function accentTokens(id: string, mode: ThemeMode): AccentTokens | null {
  const a = accents.find((x) => x.id === id);
  return a ? a[mode] : null;
}
