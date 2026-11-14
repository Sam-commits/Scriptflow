import { DocTypeDef, getElement } from '../doctypes';
import { Block, TagItem, blockText } from '../model';
import { speakerName } from '../tags/breakdown';

// SmartType: Final Draft-style autocomplete, learned from what's already in
// the script (and from tagged Cast and Locations). Lists rank by how often an
// item is used, with a boost for items used in the last few scenes.

export const SCENE_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'I/E. ', 'EST. '];
export const TIMES = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MORNING', 'EVENING', 'AFTERNOON', 'MOMENTS LATER', 'SAME'];
export const TRANSITIONS = ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE TO BLACK.'];
export const EXTENSIONS = ['V.O.)', 'O.S.)', "CONT'D)", 'O.C.)'];
export const PARENTHETICALS = ['beat', 'pause', 'quietly', 'continuing', 'whispering', 'laughing', 'into phone', 'sotto voce'];

const TIME_RE = /\b(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DAWN|DUSK|SUNRISE|SUNSET|NOON|MIDNIGHT|LATER|CONTINUOUS|SAME|MAGIC HOUR)\b/;

export interface SuggestItem {
  text: string;
  /** Text added after the item when it's accepted, e.g. " - " after a location. */
  suffix?: string;
}

export interface Suggestions {
  /** Offset inside the element where the replaced text starts. */
  from: number;
  items: SuggestItem[];
}

export interface SmartContext {
  dt: DocTypeDef;
  /** The script, including the element being typed in. */
  blocks: Block[];
  /** Index of the element being typed in. */
  index: number;
  /** Text of that element before the cursor. */
  before: string;
  /** Breakdown items: tagged Cast and Locations join the lists. */
  tags?: TagItem[];
  /** Longest list (default 8). */
  max?: number;
  /** Open on an empty line, before anything is typed. */
  eager?: boolean;
  /** What to do on an empty Character line. */
  nextSpeaker?: 'dropdown' | 'ghost' | 'off';
}

// ---- Ranking -------------------------------------------------------------------

interface Use { value: string; index: number }

/** Most-used first, with a boost for things used just before the cursor. */
export function rank(uses: Use[], cursor: number): string[] {
  const score = new Map<string, number>();
  for (const u of uses) {
    if (!u.value) continue;
    const dist = cursor - u.index;
    const recent = dist > 0 ? 3 * Math.exp(-dist / 60) : 0;
    score.set(u.value, (score.get(u.value) ?? 0) + 1 + recent);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

function others(blocks: Block[], index: number) {
  return blocks.map((b, i) => ({ b, i })).filter(({ i }) => i !== index);
}

// ---- Scene headings ------------------------------------------------------------

export function isTime(s: string): boolean {
  return TIMES.includes(s) || TIME_RE.test(s);
}

export interface HeadingParts {
  prefix: string;
  /** "HOUSE - KITCHEN - NIGHT" -> ["HOUSE", "KITCHEN"]. */
  locations: string[];
  time: string | null;
}

export function parseHeading(text: string): HeadingParts {
  const upper = text.toUpperCase();
  const prefix = SCENE_PREFIXES.find((p) => upper.startsWith(p)) ?? '';
  const segs = upper.slice(prefix.length).split(' - ').map((s) => s.trim()).filter(Boolean);
  const time = segs.length >= 2 && isTime(segs[segs.length - 1]) ? segs.pop()! : null;
  return { prefix, locations: segs, time };
}

/** Kept for older callers: the first location and the time. */
export function sceneParts(text: string) {
  const p = parseHeading(text);
  return { prefix: p.prefix, location: p.locations.join(' - '), time: p.time };
}

function headings(dt: DocTypeDef, blocks: Block[], index: number) {
  return others(blocks, index)
    .filter(({ b }) => getElement(dt, b.type).smartType === 'sceneHeading')
    .map(({ b, i }) => ({ parts: parseHeading(blockText(b)), i }));
}

/** Places used directly under `path` ([] = top-level locations), best first. */
export function locationsUnder(dt: DocTypeDef, blocks: Block[], index: number, path: string[], tags: TagItem[] = []): string[] {
  const key = path.join(' - ');
  const uses: Use[] = [];
  for (const { parts, i } of headings(dt, blocks, index)) {
    const locs = parts.locations;
    if (locs.length > path.length && locs.slice(0, path.length).join(' - ') === key) uses.push({ value: locs[path.length], index: i });
  }
  const tagged = path.length ? [] : tags.filter((t) => t.category === 'locations').map((t) => t.name.toUpperCase().trim());
  return uniq([...rank(uses, index), ...tagged]);
}

export function knownTimes(dt: DocTypeDef, blocks: Block[], index: number): string[] {
  const uses = headings(dt, blocks, index).filter((h) => h.parts.time).map((h) => ({ value: h.parts.time!, index: h.i }));
  return uniq([...rank(uses, index), ...TIMES]);
}

export function knownPrefixes(dt: DocTypeDef, blocks: Block[], index: number): string[] {
  const uses = headings(dt, blocks, index).filter((h) => h.parts.prefix).map((h) => ({ value: h.parts.prefix, index: h.i }));
  return uniq([...rank(uses, index), ...SCENE_PREFIXES]);
}

// ---- Characters ----------------------------------------------------------------

function speakerUses(dt: DocTypeDef, blocks: Block[], index: number): Use[] {
  return others(blocks, index)
    .filter(({ b }) => getElement(dt, b.type).speaker)
    .map(({ b, i }) => ({ value: speakerName(blockText(b)).toUpperCase(), index: i }));
}

/** Every character name, best first: speakers, then tagged Cast who haven't spoken yet. */
export function characterNames(dt: DocTypeDef, blocks: Block[], index = blocks.length, tags: TagItem[] = []): string[] {
  const cast = tags.filter((t) => t.category === 'cast').map((t) => speakerName(t.name).toUpperCase());
  return uniq([...rank(speakerUses(dt, blocks, index), index), ...cast]);
}

/** Index of the scene heading at or before `index` (0 if none). */
export function sceneStartIndex(dt: DocTypeDef, blocks: Block[], index: number): number {
  for (let i = Math.min(index, blocks.length - 1); i >= 0; i--) if (getElement(dt, blocks[i].type).sceneStart) return i;
  return 0;
}

/**
 * Who probably speaks next at `index`: the person spoken to (two speeches back),
 * then others in the scene, then cast tagged in the scene, then everyone else.
 * The person who just spoke comes last.
 */
export function likelySpeakers(dt: DocTypeDef, blocks: Block[], index: number, tags: TagItem[] = []): string[] {
  const start = sceneStartIndex(dt, blocks, index);
  const inScene: string[] = [];
  for (let i = index - 1; i >= start; i--) {
    if (getElement(dt, blocks[i].type).speaker) inScene.push(speakerName(blockText(blocks[i])).toUpperCase());
  }
  const last = inScene[0];
  const order = uniq(inScene).filter((n) => n !== last);
  // Cast tagged anywhere in the scene.
  const castIds = new Set(tags.filter((t) => t.category === 'cast').map((t) => t.id));
  const tagged: string[] = [];
  for (let i = start; i < blocks.length && (i === start || !getElement(dt, blocks[i].type).sceneStart); i++) {
    const ids = [...(blocks[i].tags ?? []), ...blocks[i].runs.flatMap((r) => r.tags ?? [])];
    for (const id of ids) if (castIds.has(id)) tagged.push(speakerName(tags.find((t) => t.id === id)!.name).toUpperCase());
  }
  const all = characterNames(dt, blocks, index, tags);
  return uniq([...order, ...tagged, ...all.filter((n) => n !== last), ...(last ? [last] : [])]);
}

function extensions(dt: DocTypeDef, blocks: Block[], index: number): string[] {
  const uses: Use[] = [];
  for (const { b, i } of others(blocks, index)) {
    if (!getElement(dt, b.type).speaker) continue;
    for (const m of blockText(b).matchAll(/\(([^)]+)\)/g)) uses.push({ value: `${m[1].trim().toUpperCase()})`, index: i });
  }
  return uniq([...EXTENSIONS, ...rank(uses, index)]);
}

/** The speaker of the speech that `index` belongs to, if any. */
export function speakerAt(dt: DocTypeDef, blocks: Block[], index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const el = getElement(dt, blocks[i].type);
    if (el.speaker) return speakerName(blockText(blocks[i])).toUpperCase();
    if (!el.speech) return null;
  }
  return null;
}

function parentheticals(dt: DocTypeDef, blocks: Block[], index: number, tags: TagItem[]): string[] {
  const uses = others(blocks, index)
    .filter(({ b }) => b.type === 'parenthetical')
    .map(({ b, i }) => ({ value: blockText(b).replace(/^\(|\)$/g, '').trim(), index: i }));
  const me = speakerAt(dt, blocks, index);
  const toWhom = likelySpeakers(dt, blocks, index, tags).filter((n) => n !== me).slice(0, 3).map((n) => `to ${n}`);
  return uniq([...rank(uses, index), ...PARENTHETICALS, ...toWhom]);
}

function transitions(dt: DocTypeDef, blocks: Block[], index: number): string[] {
  const uses = others(blocks, index)
    .filter(({ b }) => getElement(dt, b.type).smartType === 'transition')
    .map(({ b, i }) => ({ value: blockText(b).toUpperCase().trim(), index: i }));
  return uniq([...rank(uses, index), ...TRANSITIONS]);
}

// ---- Suggestions ---------------------------------------------------------------

function filter(items: string[], typed: string, max: number, suffix = ''): SuggestItem[] {
  const t = typed.toUpperCase();
  return items
    .filter((i) => i.toUpperCase().startsWith(t) && i.toUpperCase() !== t)
    .slice(0, max)
    .map((text) => (suffix ? { text, suffix } : { text }));
}

export function getSuggestions(ctx: SmartContext): Suggestions | null {
  const { dt, blocks, index, before } = ctx;
  const tags = ctx.tags ?? [];
  const max = ctx.max ?? 8;
  const type = blocks[index]?.type ?? dt.firstElement;
  const el = getElement(dt, type);
  let s: Suggestions | null = null;

  if (el.smartType === 'sceneHeading') {
    const upper = before.toUpperCase();
    const prefix = SCENE_PREFIXES.find((p) => upper.startsWith(p));
    if (!prefix) {
      if (before.length || ctx.eager) s = { from: 0, items: filter(knownPrefixes(dt, blocks, index), before, max) };
    } else {
      const segs = upper.slice(prefix.length).split(' - ');
      const current = segs.pop()!;
      const path = segs.map((x) => x.trim());
      const from = before.length - current.length;
      if (!path.length) {
        s = { from, items: filter(locationsUnder(dt, blocks, index, [], tags), current, max, ' - ') };
      } else {
        const subs = filter(locationsUnder(dt, blocks, index, path), current, max, ' - ');
        const times = filter(knownTimes(dt, blocks, index), current, max);
        s = { from, items: [...subs, ...times].slice(0, max) };
      }
    }
  } else if (el.speaker) {
    const paren = before.lastIndexOf('(');
    if (paren !== -1) {
      s = { from: paren + 1, items: filter(extensions(dt, blocks, index), before.slice(paren + 1), max) };
    } else if (before.length) {
      s = { from: 0, items: filter(likelySpeakers(dt, blocks, index, tags), before, max) };
    } else if (ctx.nextSpeaker === 'dropdown' || (ctx.eager && ctx.nextSpeaker !== 'ghost')) {
      s = { from: 0, items: filter(likelySpeakers(dt, blocks, index, tags), '', max) };
    }
  } else if (el.smartType === 'transition') {
    if (before.length || ctx.eager) s = { from: 0, items: filter(transitions(dt, blocks, index), before, max) };
  } else if (type === 'parenthetical' && before.startsWith('(')) {
    const typed = before.slice(1);
    if ((typed.length || ctx.eager) && !typed.includes(')')) {
      const items = parentheticals(dt, blocks, index, tags)
        .filter((p) => p.toLowerCase().startsWith(typed.toLowerCase()) && p.toLowerCase() !== typed.toLowerCase())
        .slice(0, max).map((text) => ({ text }));
      s = { from: 1, items };
    }
  } else if (!el.speech) {
    // A capitalised name being typed in Action: "MAR" -> "MARGARET".
    const m = /(?:^|[^\p{L}\p{N}'])([A-Z][A-Z'.-]+)$/u.exec(before);
    if (m) {
      const word = m[1];
      const items = filter(characterNames(dt, blocks, index, tags), word, max);
      if (items.length) s = { from: before.length - word.length, items };
    }
  }
  return s && s.items.length ? s : null;
}
