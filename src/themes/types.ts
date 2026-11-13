/**
 * A theme is a named set of color tokens, the same way a document type is a
 * set of element definitions. Light and dark are just two configs of one shape.
 * Tokens become CSS variables (`page` -> `--page`, `panelBorder` -> `--panel-border`).
 *
 * Themes only change what you see on screen. PDF, FDX and Fountain export never
 * read them: printed scripts are always black Courier on white.
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeTokens {
  // Workspace: window background, toolbar, sidebar, dialogs.
  bg: string;
  panel: string;
  panelBorder: string;
  text: string;
  muted: string;
  // Accent: brand color, selected items, primary buttons.
  accent: string;
  accentSoft: string;
  onAccent: string;
  // Page: the paper and the script text on it.
  page: string;
  pageText: string;
  pageShadow: string;
  pageBorder: string;
  pageRule: string;
  pageMuted: string;
  // Editing.
  cursor: string;
  selection: string;
  // Status.
  error: string;
  errorSoft: string;
}

export interface ThemeDef {
  id: string;
  name: string;
  mode: ThemeMode;
  description: string;
  tokens: ThemeTokens;
}

export const TOKEN_NAMES = [
  'bg', 'panel', 'panelBorder', 'text', 'muted', 'accent', 'accentSoft', 'onAccent',
  'page', 'pageText', 'pageShadow', 'pageBorder', 'pageRule', 'pageMuted', 'cursor', 'selection',
  'error', 'errorSoft',
] as const satisfies readonly (keyof ThemeTokens)[];

export const cssVar = (token: string) => `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
