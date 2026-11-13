import { ThemeDef } from './types';

const ORANGE_LIGHT = { accent: '#b43c0b', accentSoft: '#fde8dc', onAccent: '#ffffff' };
const ORANGE_DARK = { accent: '#fb923c', accentSoft: '#3b2417', onAccent: '#1a1208' };
const LIGHT_ERROR = { error: '#8a1c1c', errorSoft: '#fde2e2' };
const DARK_ERROR = { error: '#fca5a5', errorSoft: '#3b1a1a' };

export const paper: ThemeDef = {
  id: 'paper', name: 'Paper', mode: 'light',
  description: 'Closest to the printed page',
  tokens: {
    bg: '#eceae6', panel: '#f8f7f5', panelBorder: '#dcd9d3', text: '#22201c', muted: '#6a655d',
    ...ORANGE_LIGHT,
    page: '#ffffff', pageText: '#111111',
    pageShadow: '0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08)',
    pageBorder: 'transparent', pageRule: '#c9c5bd', pageMuted: '#77726a',
    cursor: '#111111', selection: 'rgba(194,65,12,.18)',
    ...LIGHT_ERROR,
  },
};

export const manuscript: ThemeDef = {
  id: 'manuscript', name: 'Manuscript', mode: 'light',
  description: 'Warm cream paper, softer for long days',
  tokens: {
    bg: '#e8e1d3', panel: '#f5efe3', panelBorder: '#d8cdb8', text: '#2a241c', muted: '#675d4e',
    accent: '#a6420e', accentSoft: '#f6dfcc', onAccent: '#ffffff',
    page: '#fbf6ea', pageText: '#2a241c',
    pageShadow: '0 1px 3px rgba(60,40,10,.14), 0 8px 24px rgba(60,40,10,.08)',
    pageBorder: 'transparent', pageRule: '#d4c7ae', pageMuted: '#7d705c',
    cursor: '#2a241c', selection: 'rgba(166,66,14,.18)',
    ...LIGHT_ERROR,
  },
};

export const highContrast: ThemeDef = {
  id: 'high-contrast', name: 'High Contrast', mode: 'light',
  description: 'Pure black on white for bright rooms',
  tokens: {
    bg: '#ffffff', panel: '#ffffff', panelBorder: '#000000', text: '#000000', muted: '#3a3a3a',
    accent: '#9a2f00', accentSoft: '#ffe3d1', onAccent: '#ffffff',
    page: '#ffffff', pageText: '#000000',
    pageShadow: 'none', pageBorder: '#000000', pageRule: '#000000', pageMuted: '#3a3a3a',
    cursor: '#000000', selection: 'rgba(0,0,0,.2)',
    error: '#7a0000', errorSoft: '#ffe0e0',
  },
};

export const night: ThemeDef = {
  id: 'night', name: 'Night', mode: 'dark',
  description: 'Dark grey page with light text',
  tokens: {
    bg: '#18171a', panel: '#212024', panelBorder: '#34323a', text: '#ebe8e3', muted: '#a29d95',
    ...ORANGE_DARK,
    page: '#26252a', pageText: '#ece9e4',
    pageShadow: '0 1px 3px rgba(0,0,0,.5)',
    pageBorder: 'transparent', pageRule: '#4a4750', pageMuted: '#9c978f',
    cursor: '#ece9e4', selection: 'rgba(251,146,60,.28)',
    ...DARK_ERROR,
  },
};

export const midnight: ThemeDef = {
  id: 'midnight', name: 'Midnight', mode: 'dark',
  description: 'Near-black, for OLED screens and dark rooms',
  tokens: {
    bg: '#000000', panel: '#0b0b0d', panelBorder: '#26252b', text: '#d9d6d0', muted: '#96918a',
    ...ORANGE_DARK,
    page: '#0d0d0f', pageText: '#d9d6d0',
    pageShadow: 'none', pageBorder: '#26252b', pageRule: '#34323a', pageMuted: '#86817a',
    cursor: '#d9d6d0', selection: 'rgba(251,146,60,.26)',
    ...DARK_ERROR,
  },
};

export const darkDesk: ThemeDef = {
  id: 'dark-desk', name: 'Dark Desk', mode: 'dark',
  description: 'Dark workspace with a real white page',
  tokens: {
    bg: '#18171a', panel: '#212024', panelBorder: '#34323a', text: '#ebe8e3', muted: '#a29d95',
    ...ORANGE_DARK,
    page: '#ffffff', pageText: '#111111',
    pageShadow: '0 1px 3px rgba(0,0,0,.6), 0 10px 30px rgba(0,0,0,.45)',
    pageBorder: 'transparent', pageRule: '#c9c5bd', pageMuted: '#77726a',
    cursor: '#111111', selection: 'rgba(194,65,12,.2)',
    ...DARK_ERROR,
  },
};

export const builtinThemes: ThemeDef[] = [paper, manuscript, highContrast, night, midnight, darkDesk];
