import { DocTypeDef, getElement } from '../doctypes';
import { Block, CharacterProfile, TagItem, blockText } from '../model';
import { SceneRange, normName, sceneRanges, speakerName } from '../tags/breakdown';

/**
 * Where a character is in the script. Built from what the script already has:
 * their character cues, their Cast tags (from Tag or "Tag all characters"),
 * scene-level Cast tags, and their name or aliases wherever else it is written.
 */

export type AppearanceKind =
  /** They have a speech: the cue, with the first line of what they say. */
  | 'speaks'
  /** Named or tagged in action or description. */
  | 'action'
  /** Someone else says their name. */
  | 'named'
  /** Tagged on the scene without being written (Breakdown: Add to this scene). */
  | 'scene';

export interface Appearance {
  kind: AppearanceKind;
  /** Block index, and the character offsets of the match inside that block's text. */
  index: number;
  from: number;
  to: number;
  /** A short piece of the text around it. */
  snippet: string;
  /** For `named`: who says it. */
  by?: string;
}

export interface SceneAppearances {
  scene: SceneRange;
  entries: Appearance[];
  speeches: number;
}

export interface CharacterAppearances {
  scenes: SceneAppearances[];
  speeches: number;
  /** Mentions outside their own cues: action, other people's lines and scene tags. */
  mentions: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function namePattern(names: string[]): RegExp | null {
  const alts = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((n) => escapeRe(n).replace(/\s+/g, '\\s+'));
  return alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
}

function snippet(text: string, from: number, to: number, room = 40): string {
  const flat = text.replace(/\n/g, ' ');
  const a = Math.max(0, from - room), b = Math.min(flat.length, to + room);
  return `${a > 0 ? '…' : ''}${flat.slice(a, b).trim()}${b < flat.length ? '…' : ''}`;
}

/** Character offsets of the stretches of `b` tagged with `id`. */
function taggedSpans(b: Block, id: string): [number, number][] {
  const out: [number, number][] = [];
  let pos = 0;
  for (const r of b.runs) {
    const end = pos + r.text.length;
    if (r.tags?.includes(id)) {
      const last = out[out.length - 1];
      if (last && last[1] === pos) last[1] = end; else out.push([pos, end]);
    }
    pos = end;
  }
  return out;
}

export function characterAppearances(
  dt: DocTypeDef, blocks: Block[], item: TagItem, profile?: CharacterProfile,
): CharacterAppearances {
  const me = normName(speakerName(item.name));
  const re = namePattern([speakerName(item.name), ...(profile?.aliases ?? [])]);
  const result: CharacterAppearances = { scenes: [], speeches: 0, mentions: 0 };

  for (const scene of sceneRanges(dt, blocks)) {
    const entries: Appearance[] = [];
    let speeches = 0;
    let speaker = '';
    for (let i = scene.start; i < scene.end; i++) {
      const b = blocks[i];
      const el = getElement(dt, b.type);
      const text = blockText(b);
      if ((b.tags ?? []).includes(item.id)) entries.push({ kind: 'scene', index: i, from: 0, to: text.length, snippet: text });
      if (el.speaker) {
        speaker = speakerName(text);
        if (normName(speaker) === me) {
          speeches++;
          const line = blocks.slice(i + 1, scene.end).find((x) => getElement(dt, x.type).speech && !/^\(.*\)$/.test(blockText(x).trim()));
          entries.push({ kind: 'speaks', index: i, from: 0, to: text.length, snippet: line ? snippet(blockText(line), 0, 0, 70) : '' });
        }
        continue;
      }
      if (el.sceneStart || el.sectionStart || el.smartType === 'transition') continue;
      const own = el.speech && normName(speaker) === me;
      if (own) continue;
      // Tagged stretches first, then untagged mentions of the name.
      const spans = taggedSpans(b, item.id);
      if (re) {
        for (const m of text.matchAll(re)) {
          const from = m.index!, to = from + m[0].length;
          if (!spans.some(([a, z]) => from < z && to > a)) spans.push([from, to]);
        }
      }
      spans.sort((a, z) => a[0] - z[0]);
      for (const [from, to] of spans) {
        entries.push(el.speech
          ? { kind: 'named', index: i, from, to, snippet: snippet(text, from, to), by: speaker }
          : { kind: 'action', index: i, from, to, snippet: snippet(text, from, to) });
      }
    }
    if (entries.length) {
      result.scenes.push({ scene, entries, speeches });
      result.speeches += speeches;
      result.mentions += entries.filter((e) => e.kind !== 'speaks').length;
    }
  }
  return result;
}
