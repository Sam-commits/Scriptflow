import { EditorState, Transaction } from 'prosemirror-state';
import { DocTypeDef, getElement } from '../doctypes';
import { Range, findMentions } from '../editor/tagging';
import { parseHeading } from '../editor/smarttype';
import { speakerName } from '../tags/breakdown';

/**
 * Script-wide renames from the Names & places list. Each returns one
 * transaction, so a rename is a single undo step. Tags on the renamed words
 * are kept.
 */

/** Match the case of the text being replaced: MARA -> NORA, Mara -> Nora. */
export function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original === original.toLowerCase()) return replacement.toLowerCase();
  return replacement.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

function replaceAll(tr: Transaction, ranges: Range[], replacement: (original: string) => string): Transaction {
  // Back to front so earlier positions stay valid.
  for (const r of [...ranges].sort((a, b) => b.from - a.from)) {
    const original = tr.doc.textBetween(r.from, r.to);
    const next = replacement(original);
    if (next !== original) tr.insertText(next, r.from, r.to);
  }
  return tr;
}

/** Rename a character on every cue and wherever the name appears in the script. */
export function renameCharacter(state: EditorState, dt: DocTypeDef, from: string, to: string): Transaction {
  const old = from.trim();
  const name = to.trim();
  const tr = state.tr;
  if (!old || !name || old.toUpperCase() === name.toUpperCase() && old === name) return tr;
  const ranges: Range[] = [];
  state.doc.forEach((node, offset) => {
    if (!getElement(dt, node.attrs.type).speaker) return;
    const text = node.textContent;
    if (speakerName(text).toUpperCase() !== old.toUpperCase()) return;
    const at = text.toUpperCase().indexOf(old.toUpperCase());
    if (at >= 0) ranges.push({ from: offset + 1 + at, to: offset + 1 + at + old.length });
  });
  const cues = new Set(ranges.map((r) => r.from));
  for (const r of findMentions(state.doc, old)) if (!cues.has(r.from)) ranges.push(r);
  return replaceAll(tr, ranges, (o) => matchCase(o, name));
}

/**
 * Rename a place in scene headings. `path` is the place and the places it sits
 * under: ["HOUSE", "KITCHEN"] renames KITCHEN only where it is under HOUSE.
 */
export function renameLocation(state: EditorState, dt: DocTypeDef, path: string[], to: string): Transaction {
  const tr = state.tr;
  const name = to.trim().toUpperCase();
  if (!path.length || !name) return tr;
  const depth = path.length - 1;
  const ranges: Range[] = [];
  state.doc.forEach((node, offset) => {
    if (getElement(dt, node.attrs.type).smartType !== 'sceneHeading') return;
    const text = node.textContent;
    const parts = parseHeading(text);
    if (parts.locations.length <= depth) return;
    if (parts.locations.slice(0, depth + 1).join(' - ') !== path.join(' - ')) return;
    // Find where segment `depth` starts in the raw text.
    let pos = parts.prefix.length;
    const raw = text.slice(pos).split(' - ');
    for (let k = 0; k < depth; k++) pos += raw[k].length + 3;
    const seg = raw[depth];
    const lead = seg.length - seg.trimStart().length;
    const start = offset + 1 + pos + lead;
    ranges.push({ from: start, to: start + seg.trim().length });
  });
  return replaceAll(tr, ranges, () => name);
}
