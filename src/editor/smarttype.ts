import { DocTypeDef, getElement } from '../doctypes';
import { Block, blockText } from '../model';

// SmartType: Final Draft-style autocomplete for scene headings, character
// names and transitions, learned from what's already in the script.

export const SCENE_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. '];
export const TIMES = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MORNING', 'EVENING', 'AFTERNOON', 'MOMENTS LATER', 'SAME'];
export const TRANSITIONS = ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE TO BLACK.'];
export const EXTENSIONS = ['V.O.)', 'O.S.)', "CONT'D)", 'O.C.)'];

export interface Suggestions {
  /** Offset inside the element where the replaced text starts. */
  from: number;
  items: string[];
  /** Text appended after the chosen item. */
  suffix: string;
}

function byFrequency(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

export function characterNames(dt: DocTypeDef, blocks: Block[]): string[] {
  return byFrequency(blocks
    .filter((b) => getElement(dt, b.type).speaker)
    .map((b) => blockText(b).replace(/\(.*$/, '').trim().toUpperCase()));
}

export function sceneParts(text: string) {
  const upper = text.toUpperCase();
  const prefix = SCENE_PREFIXES.find((p) => upper.startsWith(p)) ?? '';
  const rest = upper.slice(prefix.length);
  const dash = rest.indexOf(' - ');
  return {
    prefix,
    location: (dash === -1 ? rest : rest.slice(0, dash)).trim(),
    time: dash === -1 ? null : rest.slice(dash + 3).trim(),
  };
}

export function locations(dt: DocTypeDef, blocks: Block[]): string[] {
  return byFrequency(blocks
    .filter((b) => getElement(dt, b.type).smartType === 'sceneHeading')
    .map((b) => sceneParts(blockText(b)).location));
}

function filter(items: string[], typed: string): string[] {
  const t = typed.toUpperCase();
  return items.filter((i) => i.toUpperCase().startsWith(t) && i.toUpperCase() !== t).slice(0, 8);
}

/**
 * @param before text of the current element before the cursor
 * @param others every other element in the script (the current one excluded)
 */
export function getSuggestions(dt: DocTypeDef, type: string, before: string, others: Block[]): Suggestions | null {
  const kind = getElement(dt, type).smartType;
  let s: Suggestions | null = null;
  if (kind === 'sceneHeading') {
    const upper = before.toUpperCase();
    const prefix = SCENE_PREFIXES.find((p) => upper.startsWith(p));
    if (!prefix) {
      if (before.length) s = { from: 0, items: filter(SCENE_PREFIXES, before), suffix: '' };
    } else {
      const dash = upper.indexOf(' - ', prefix.length);
      if (dash === -1) {
        s = { from: prefix.length, items: filter(locations(dt, others), before.slice(prefix.length)), suffix: ' - ' };
      } else {
        s = { from: dash + 3, items: filter(TIMES, before.slice(dash + 3)), suffix: '' };
      }
    }
  } else if (kind === 'character') {
    const paren = before.lastIndexOf('(');
    if (paren !== -1) s = { from: paren + 1, items: filter(EXTENSIONS, before.slice(paren + 1)), suffix: '' };
    else if (before.length) s = { from: 0, items: filter(characterNames(dt, others), before), suffix: '' };
  } else if (kind === 'transition' && before.length) {
    s = { from: 0, items: filter(TRANSITIONS, before), suffix: '' };
  }
  return s && s.items.length ? s : null;
}
