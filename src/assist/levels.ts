/**
 * Assistance levels: one choice (Beginner, Intermediate, Professional or a
 * Custom setup) sets every writing-assistant switch at once. Levels are data,
 * like themes and document types, and they never change what prints or exports.
 */

export interface AssistSettings {
  /** SmartType dropdown (names, locations, times, transitions, extensions, parentheticals). */
  smartType: boolean;
  /** Open the dropdown on an empty line, before anything is typed. */
  smartTypeEager: boolean;
  /** Longest dropdown list. */
  smartTypeMax: number;
  /** On an empty Character line: suggest the likely speaker as a dropdown, as ghost text, or not at all. */
  nextSpeaker: 'dropdown' | 'ghost' | 'off';
  /** Ghost text for structure: scene heading prefixes, transitions, (CONT'D). */
  ghostStructure: boolean;
  /** Ghost text that finishes phrases already used in dialogue and action. */
  ghostPhrases: boolean;
  /** Milliseconds after typing stops before ghost text appears. */
  ghostDelay: number;
  /** Key that accepts ghost text. */
  acceptKey: 'tab' | 'right' | 'both';
  /** The "/" command menu and the scene builder pop-up. */
  sceneBuilder: boolean;
  /** Explanations inside the scene builder pop-up. */
  sceneBuilderHelp: boolean;
  /** Grey hint text in empty elements: everywhere, only in scenes from the builder, or never. */
  hints: 'all' | 'builder' | 'off';
  /** Status-bar element guide. */
  elementGuide: 'full' | 'name' | 'off';
  /** Soft underlines for common formatting mistakes. */
  formatCoach: 'all' | 'serious' | 'off';
  /** Goal / conflict / turn fields in the scene builder. */
  sceneNotes: 'prompts' | 'shown' | 'collapsed';
}

export type PresetId = 'beginner' | 'intermediate' | 'professional';
export type LevelId = PresetId | 'custom';

export interface LevelDef {
  id: PresetId;
  name: string;
  description: string;
  settings: AssistSettings;
}

const common = { smartType: true, ghostDelay: 400, acceptKey: 'both' as const, sceneBuilder: true };

export const LEVELS: LevelDef[] = [
  {
    id: 'beginner',
    name: 'Beginner',
    description: 'New to screenwriting. Lots of hints, a guide to every element, and gentle tips on format.',
    settings: {
      ...common, smartTypeEager: true, smartTypeMax: 8, nextSpeaker: 'dropdown',
      ghostStructure: true, ghostPhrases: false, sceneBuilderHelp: true,
      hints: 'all', elementGuide: 'full', formatCoach: 'all', sceneNotes: 'prompts',
    },
  },
  {
    id: 'intermediate',
    name: 'Intermediate',
    description: 'You know the format. Predictions save typing; tips only for real mistakes.',
    settings: {
      ...common, smartTypeEager: false, smartTypeMax: 8, nextSpeaker: 'ghost',
      ghostStructure: true, ghostPhrases: true, sceneBuilderHelp: false,
      hints: 'builder', elementGuide: 'name', formatCoach: 'serious', sceneNotes: 'shown',
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Stay out of the way. Short SmartType lists and the / scene builder, nothing else.',
    settings: {
      ...common, smartTypeEager: false, smartTypeMax: 5, nextSpeaker: 'ghost',
      ghostStructure: false, ghostPhrases: false, sceneBuilderHelp: false,
      hints: 'off', elementGuide: 'off', formatCoach: 'off', sceneNotes: 'collapsed',
    },
  },
];

export const getLevel = (id: PresetId): LevelDef => LEVELS.find((l) => l.id === id) ?? LEVELS[1];

export interface CustomSetup {
  id: string;
  name: string;
  settings: AssistSettings;
}

/** Saved per browser under ASSIST_KEY. */
export interface AssistConfig {
  version: 1;
  level: LevelId;
  /** Named Custom setups. */
  customs: CustomSetup[];
  /** The Custom setup in use when `level` is 'custom'. */
  activeCustom: string | null;
  /** The toolbar Ghost switch (Ctrl/⌘+Shift+G). null = follow the level. */
  ghost: boolean | null;
  /** The first-run level picker has been answered. */
  chosen: boolean;
}

export const ASSIST_KEY = 'scriptflow:assist';

export const DEFAULT_ASSIST: AssistConfig = {
  version: 1, level: 'intermediate', customs: [], activeCustom: null, ghost: null, chosen: false,
};

/** The switches in force for a config, before the Ghost switch. */
export function levelSettings(c: AssistConfig): AssistSettings {
  if (c.level === 'custom') {
    const s = c.customs.find((x) => x.id === c.activeCustom) ?? c.customs[0];
    if (s) return s.settings;
  }
  return getLevel(c.level === 'custom' ? 'intermediate' : c.level).settings;
}

/** Whether the level itself shows any ghost text. */
export const levelHasGhost = (s: AssistSettings) => s.ghostStructure || s.ghostPhrases || s.nextSpeaker === 'ghost';

/** The switches the editor actually uses, with the Ghost switch applied. */
export function effectiveSettings(c: AssistConfig): AssistSettings {
  const s = levelSettings(c);
  if (c.ghost === false) {
    return { ...s, ghostStructure: false, ghostPhrases: false, nextSpeaker: s.nextSpeaker === 'ghost' ? 'off' : s.nextSpeaker };
  }
  if (c.ghost === true && !s.ghostStructure && !s.ghostPhrases) {
    // Turned on in a level that has none: show both kinds.
    return { ...s, ghostStructure: true, ghostPhrases: true };
  }
  return s;
}

/** Whether ghost text is showing, for the toolbar switch. */
export function ghostOn(c: AssistConfig): boolean {
  const s = effectiveSettings(c);
  return s.ghostStructure || s.ghostPhrases;
}

export function levelName(c: AssistConfig): string {
  if (c.level === 'custom') return c.customs.find((x) => x.id === c.activeCustom)?.name ?? 'Custom';
  return getLevel(c.level).name;
}

// ---- Loading and saving ------------------------------------------------------

const pick = <T,>(x: unknown, ok: readonly T[], fb: T) => (ok.includes(x as T) ? (x as T) : fb);

/** Fill in missing or invalid switches so older or hand-edited setups still load. */
export function normalizeSettings(v: unknown, fb: AssistSettings = getLevel('intermediate').settings): AssistSettings {
  const s = (v && typeof v === 'object' ? v : {}) as Partial<AssistSettings>;
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  const num = (x: unknown, d: number, lo: number, hi: number) =>
    (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
  return {
    smartType: bool(s.smartType, fb.smartType),
    smartTypeEager: bool(s.smartTypeEager, fb.smartTypeEager),
    smartTypeMax: num(s.smartTypeMax, fb.smartTypeMax, 3, 12),
    nextSpeaker: pick(s.nextSpeaker, ['dropdown', 'ghost', 'off'] as const, fb.nextSpeaker),
    ghostStructure: bool(s.ghostStructure, fb.ghostStructure),
    ghostPhrases: bool(s.ghostPhrases, fb.ghostPhrases),
    ghostDelay: num(s.ghostDelay, fb.ghostDelay, 0, 3000),
    acceptKey: pick(s.acceptKey, ['tab', 'right', 'both'] as const, fb.acceptKey),
    sceneBuilder: bool(s.sceneBuilder, fb.sceneBuilder),
    sceneBuilderHelp: bool(s.sceneBuilderHelp, fb.sceneBuilderHelp),
    hints: pick(s.hints, ['all', 'builder', 'off'] as const, fb.hints),
    elementGuide: pick(s.elementGuide, ['full', 'name', 'off'] as const, fb.elementGuide),
    formatCoach: pick(s.formatCoach, ['all', 'serious', 'off'] as const, fb.formatCoach),
    sceneNotes: pick(s.sceneNotes, ['prompts', 'shown', 'collapsed'] as const, fb.sceneNotes),
  };
}

function normalizeCustom(v: unknown, i: number): CustomSetup | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Partial<CustomSetup>;
  return {
    id: typeof c.id === 'string' && c.id ? c.id : `custom-${i + 1}`,
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 40) : `Custom ${i + 1}`,
    settings: normalizeSettings(c.settings),
  };
}

export function normalizeAssist(v: unknown): AssistConfig {
  const c = (v && typeof v === 'object' ? v : {}) as Partial<AssistConfig>;
  const customs = Array.isArray(c.customs) ? c.customs.map(normalizeCustom).filter((x): x is CustomSetup => !!x) : [];
  let level = pick(c.level, ['beginner', 'intermediate', 'professional', 'custom'] as const, DEFAULT_ASSIST.level);
  const activeCustom = customs.find((x) => x.id === c.activeCustom)?.id ?? customs[0]?.id ?? null;
  if (level === 'custom' && !activeCustom) level = 'intermediate';
  return {
    version: 1,
    level,
    customs,
    activeCustom,
    ghost: typeof c.ghost === 'boolean' ? c.ghost : null,
    chosen: typeof c.chosen === 'boolean' ? c.chosen : false,
  };
}

export function loadAssist(): AssistConfig {
  try {
    const raw = localStorage.getItem(ASSIST_KEY);
    return raw ? normalizeAssist(JSON.parse(raw)) : DEFAULT_ASSIST;
  } catch { return DEFAULT_ASSIST; }
}

export function saveAssist(c: AssistConfig) {
  try { localStorage.setItem(ASSIST_KEY, JSON.stringify(c)); } catch { /* storage blocked */ }
}

// ---- Custom setups -------------------------------------------------------------

/** A new Custom setup copied from what's in force now, made active. */
export function addCustom(c: AssistConfig, name: string, id: string): AssistConfig {
  const setup: CustomSetup = { id, name: name.trim() || `Custom ${c.customs.length + 1}`, settings: { ...levelSettings(c) } };
  return { ...c, level: 'custom', customs: [...c.customs, setup], activeCustom: id, ghost: null };
}

export function updateCustom(c: AssistConfig, id: string, patch: Partial<Omit<CustomSetup, 'id'>>): AssistConfig {
  return { ...c, customs: c.customs.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

export function removeCustom(c: AssistConfig, id: string): AssistConfig {
  const customs = c.customs.filter((x) => x.id !== id);
  const activeCustom = c.activeCustom === id ? customs[0]?.id ?? null : c.activeCustom;
  return { ...c, customs, activeCustom, level: c.level === 'custom' && !activeCustom ? 'intermediate' : c.level };
}

/** The file written by "Export setups". */
export interface AssistExport { kind: 'scriptflow-assist'; version: 1; setups: CustomSetup[] }

export function exportCustoms(c: AssistConfig): string {
  const data: AssistExport = { kind: 'scriptflow-assist', version: 1, setups: c.customs };
  return JSON.stringify(data, null, 2);
}

/** Add the setups in an exported file. Setups whose name already exists are replaced. */
export function importCustoms(c: AssistConfig, text: string, newId: () => string): AssistConfig {
  const data = JSON.parse(text) as Partial<AssistExport>;
  if (!data || data.kind !== 'scriptflow-assist' || !Array.isArray(data.setups)) {
    throw new Error('This is not an exported assistant setup file.');
  }
  const incoming = data.setups.map(normalizeCustom).filter((x): x is CustomSetup => !!x);
  if (!incoming.length) throw new Error('That file has no setups in it.');
  let customs = [...c.customs];
  for (const s of incoming) {
    const same = customs.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    customs = same ? customs.map((x) => (x === same ? { ...s, id: same.id } : x)) : [...customs, { ...s, id: newId() }];
  }
  const active = customs.find((x) => x.name.toLowerCase() === incoming[0].name.toLowerCase())!;
  return { ...c, customs, level: 'custom', activeCustom: active.id, ghost: null };
}
