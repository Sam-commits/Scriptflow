import { DocTypeDef, getElement } from '../doctypes';
import { Block, TagItem, blockText } from '../model';
import { speakerName } from '../tags/breakdown';
import {
  knownPrefixes, likelySpeakers, parseHeading, rank, sceneStartIndex, speakerAt, TRANSITIONS,
} from '../editor/smarttype';
import { AssistSettings } from './levels';

/**
 * Ghost text: a guess at what comes next, learned only from this script. It
 * runs entirely in the browser. Structure guesses (who speaks next, the next
 * scene heading's prefix, (CONT'D), the usual transition) come from the
 * script's shape; phrase guesses finish wording the writer has already used,
 * and only when the script makes the next words clear.
 */

export interface PredictContext {
  dt: DocTypeDef;
  blocks: Block[];
  index: number;
  before: string;
  /** Text after the cursor in the element. Ghost text only shows at the end of an element. */
  after: string;
  settings: AssistSettings;
  tags?: TagItem[];
}

export function predict(ctx: PredictContext): string | null {
  const { dt, blocks, index, before, after, settings: s } = ctx;
  if (after.length || index < 0 || index >= blocks.length) return null;
  const el = getElement(dt, blocks[index].type);
  const tags = ctx.tags ?? [];

  if (el.speaker) {
    if (!before && s.nextSpeaker === 'ghost') return likelySpeakers(dt, blocks, index, tags)[0] ?? null;
    if (before && s.ghostStructure) return contd(dt, blocks, index, before);
    return null;
  }
  if (el.smartType === 'sceneHeading') {
    return !before && s.ghostStructure ? nextHeading(dt, blocks, index) : null;
  }
  if (el.smartType === 'transition') {
    if (before || !s.ghostStructure) return null;
    const uses = blocks.map((b, i) => ({ b, i }))
      .filter(({ b, i }) => i !== index && getElement(dt, b.type).smartType === 'transition')
      .map(({ b, i }) => ({ value: blockText(b).toUpperCase().trim(), index: i }))
      .filter((u) => u.value !== 'FADE IN:');
    return rank(uses, index)[0] ?? TRANSITIONS[0];
  }
  if (s.ghostPhrases && before.trim() && blocks[index].type !== 'parenthetical') {
    return phrase(corpus(dt, blocks, index), before);
  }
  return null;
}

/** " (CONT'D)" when the same character speaks again after only action in between. */
function contd(dt: DocTypeDef, blocks: Block[], index: number, before: string): string | null {
  if (before.includes('(') || /\s$/.test(before)) return null;
  const name = speakerName(before).toUpperCase();
  const start = sceneStartIndex(dt, blocks, index);
  let sawAction = false;
  for (let i = index - 1; i > start; i--) {
    const el = getElement(dt, blocks[i].type);
    if (el.speaker) {
      if (!sawAction || speakerName(blockText(blocks[i])).toUpperCase() !== name) return null;
      return dt.moreContd ? " (CONT'D)" : null;
    }
    if (!el.speech && blockText(blocks[i]).trim()) sawAction = true;
  }
  return null;
}

/** The usual prefix, plus the place from two scenes back when the script cuts back and forth. */
function nextHeading(dt: DocTypeDef, blocks: Block[], index: number): string | null {
  const prior = blocks.slice(0, index)
    .filter((b) => getElement(dt, b.type).smartType === 'sceneHeading')
    .map((b) => parseHeading(blockText(b)))
    .filter((p) => p.prefix);
  if (!prior.length) return null;
  const prefix = knownPrefixes(dt, blocks, index)[0];
  const twoBack = prior.length >= 2 ? prior[prior.length - 2] : null;
  const last = prior[prior.length - 1];
  if (twoBack && twoBack.locations.length && twoBack.locations.join(' - ') !== last.locations.join(' - ')) {
    return `${twoBack.prefix}${twoBack.locations.join(' - ')} - `;
  }
  return prefix;
}

/** Text the guess learns from: this character's own dialogue, or other elements of the same kind. */
export function corpus(dt: DocTypeDef, blocks: Block[], index: number): string[] {
  const type = blocks[index].type;
  const el = getElement(dt, type);
  if (el.speech) {
    const me = speakerAt(dt, blocks, index);
    if (!me) return [];
    return blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => i !== index && b.type === type && speakerAt(dt, blocks, i) === me)
      .map(({ b }) => blockText(b));
  }
  return blocks.filter((b, i) => i !== index && b.type === type).map(blockText);
}

interface Model {
  tri: Map<string, Map<string, number>>;
  bi: Map<string, Map<string, number>>;
  uni: Map<string, number>;
}

const key = (w: string) => w.toLowerCase();

function bump(m: Map<string, Map<string, number>>, k: string, next: string) {
  let inner = m.get(k);
  if (!inner) m.set(k, (inner = new Map()));
  inner.set(next, (inner.get(next) ?? 0) + 1);
}

export function buildModel(texts: string[]): Model {
  const model: Model = { tri: new Map(), bi: new Map(), uni: new Map() };
  for (const t of texts) {
    const words = t.split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      model.uni.set(w, (model.uni.get(w) ?? 0) + 1);
      if (i >= 1) bump(model.bi, key(words[i - 1]), w);
      if (i >= 2) bump(model.tri, `${key(words[i - 2])} ${key(words[i - 1])}`, w);
    });
  }
  return model;
}

const MIN_COUNT = 2;
const MIN_SHARE = 0.6;
const MAX_WORDS = 6;

/** The clear favorite among `options` that starts with `partial`, if there is one. */
function favorite(options: Map<string, number> | undefined, partial: string, minLen = 0): string | null {
  if (!options) return null;
  const p = partial.toLowerCase();
  let total = 0;
  let best: [string, number] | null = null;
  for (const [w, n] of options) {
    if (!w.toLowerCase().startsWith(p) || w.length <= Math.max(partial.length, minLen - 1)) continue;
    total += n;
    if (!best || n > best[1]) best = [w, n];
  }
  if (!best || best[1] < MIN_COUNT || best[1] / total < MIN_SHARE) return null;
  return best[0];
}

function nextWord(m: Model, context: string[], partial: string): string | null {
  const n = context.length;
  if (n >= 2) {
    const w = favorite(m.tri.get(`${key(context[n - 2])} ${key(context[n - 1])}`), partial);
    if (w) return w;
  }
  if (n >= 1) {
    const w = favorite(m.bi.get(key(context[n - 1])), partial);
    if (w) return w;
  }
  // Finishing a long word that's been used before.
  if (partial.length >= 3) return favorite(m.uni, partial, partial.length + 2);
  return null;
}

/** Ghost text that continues `before`, or null when the script doesn't make it clear. */
export function phrase(texts: string[], before: string): string | null {
  if (!texts.length) return null;
  const m = buildModel(texts);
  const endsWithSpace = /\s$/.test(before);
  const words = before.split(/\s+/).filter(Boolean);
  const partial = endsWithSpace ? '' : words.pop() ?? '';
  const context = [...words];

  const first = nextWord(m, context, partial);
  if (!first) return null;
  let out = first.slice(partial.length);
  context.push(first);
  for (let i = 0; i < MAX_WORDS - 1 && !/[.!?]["')]?$/.test(context[context.length - 1]); i++) {
    const w = nextWord(m, context, '');
    if (!w) break;
    out += ` ${w}`;
    context.push(w);
  }
  if (!partial && !endsWithSpace) out = ` ${out}`;
  return out || null;
}
