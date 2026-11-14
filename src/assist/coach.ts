import { DocTypeDef, getElement } from '../doctypes';
import { Block, blockText } from '../model';
import { speakerName } from '../tags/breakdown';
import { SCENE_PREFIXES } from '../editor/smarttype';

/**
 * Format coach: gentle notes on common formatting mistakes, shown as soft
 * underlines with a one-line tip. It never changes the script.
 */

export interface CoachIssue {
  /** Block index. */
  index: number;
  /** Character offsets inside the block; missing = the whole element. */
  from?: number;
  to?: number;
  /** Serious issues show at every coach setting; tips only at "all". */
  serious: boolean;
  message: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CHARS_PER_INCH = 10;

function lineCount(text: string, widthIn: number): number {
  const per = Math.max(1, Math.floor(widthIn * CHARS_PER_INCH));
  return text.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / per)), 0);
}

export function checkFormat(dt: DocTypeDef, blocks: Block[]): CoachIssue[] {
  const out: CoachIssue[] = [];
  const els = blocks.map((b) => getElement(dt, b.type));
  const texts = blocks.map(blockText);

  blocks.forEach((b, i) => {
    const el = els[i];
    const text = texts[i];
    const trimmed = text.trim();
    if (!trimmed) return;

    if (el.smartType === 'sceneHeading' && !SCENE_PREFIXES.some((p) => text.toUpperCase().startsWith(p))) {
      out.push({ index: i, serious: true, message: 'Scene headings start with INT. (inside) or EXT. (outside), then the place and the time of day.' });
    }
    if (el.speaker) {
      const next = els[i + 1];
      if (!next || !next.speech) {
        out.push({ index: i, serious: true, message: 'A character name needs their dialogue right under it.' });
      }
    }
    if (el.speech && b.type !== 'parenthetical') {
      const prev = els[i - 1];
      if (!prev || !(prev.speaker || prev.speech)) {
        out.push({ index: i, serious: true, message: 'This dialogue has no character name above it. Press Tab on an empty line to make a Character.' });
      }
    }
    if (b.type === 'parenthetical' && lineCount(text, el.width) > 1) {
      out.push({ index: i, serious: false, message: 'Parentheticals work best as a few words. Put longer directions in Action.' });
    }
    if (el.splittable && !el.speech && !el.uppercase) {
      const lines = lineCount(text, el.width);
      if (lines > 4) out.push({ index: i, serious: false, message: `This action paragraph is ${lines} lines. Breaking it into shorter paragraphs keeps the read fast.` });
    }
    if (el.smartType === 'transition' && !/[:.]$/.test(trimmed)) {
      out.push({ index: i, serious: false, message: 'Transitions usually end with a colon, like CUT TO:' });
    }
  });

  // A character's first appearance in action is written in CAPITALS.
  const names = new Set<string>();
  blocks.forEach((_, i) => { if (els[i].speaker) { const n = speakerName(texts[i]).toUpperCase(); if (n.length >= 2) names.add(n); } });
  for (const name of names) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
    for (let i = 0; i < blocks.length; i++) {
      const el = els[i];
      if (el.speech || el.speaker || el.uppercase || el.sceneStart || el.sectionStart) continue;
      const m = re.exec(texts[i]);
      if (!m) continue;
      if (m[0] !== m[0].toUpperCase()) {
        out.push({
          index: i, from: m.index, to: m.index + m[0].length, serious: false,
          message: `First time we meet ${name}: write the name in CAPITALS (and add an age if it helps).`,
        });
      }
      break;
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

export function visibleIssues(issues: CoachIssue[], level: 'all' | 'serious' | 'off'): CoachIssue[] {
  if (level === 'off') return [];
  return level === 'all' ? issues : issues.filter((x) => x.serious);
}
