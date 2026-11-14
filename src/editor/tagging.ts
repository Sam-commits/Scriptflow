import { Mark, Node as PMNode } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { DocTypeDef, getElement } from '../doctypes';
import { TagItem } from '../model';
import { findItem, speakerName } from '../tags/breakdown';
import { schema } from './schema';

/**
 * Editing operations for breakdown tags. Each returns a transaction so tagging
 * is undoable like any other edit. Tags are `tag` marks on text, plus a `tags`
 * attribute on an element for scene-level tags.
 */

const tagMark = (id: string) => schema.marks.tag.create({ id });
const isTag = (m: Mark) => m.type === schema.marks.tag;

export interface Range { from: number; to: number }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whole-word, case-insensitive matches of `text` in the elements that pass
 * `include`. Positions are document positions.
 */
export function findMentions(doc: PMNode, text: string, include: (type: string) => boolean = () => true): Range[] {
  const needle = text.trim();
  if (!needle) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
  const out: Range[] = [];
  doc.forEach((node, offset) => {
    if (!include(node.attrs.type)) return;
    // One character per position: hard breaks read as "\n".
    const t = node.textBetween(0, node.content.size, undefined, '\n');
    for (const m of t.matchAll(re)) {
      const from = offset + 1 + m.index!;
      out.push({ from, to: from + m[0].length });
    }
  });
  return out;
}

/** Elements where "tag every mention" looks: everything except dialogue and parentheticals. */
export const mentionFilter = (dt: DocTypeDef) => (type: string) => !getElement(dt, type).speech;

export function addTag(tr: Transaction, ranges: Range[], id: string): Transaction {
  for (const r of ranges) if (r.to > r.from) tr.addMark(r.from, r.to, tagMark(id));
  return tr;
}

/** The stretch of text around `pos` that carries tag `id`, within one element. */
export function tagExtent(doc: PMNode, pos: number, id: string): Range | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (parent.type !== schema.nodes.element) return null;
  const start = $pos.start();
  const spans: Range[] = [];
  let cur: Range | null = null;
  parent.forEach((child, off) => {
    const has = child.marks.some((m) => isTag(m) && m.attrs.id === id);
    const from = start + off;
    if (has) { if (cur && cur.to === from) cur.to = from + child.nodeSize; else spans.push(cur = { from, to: from + child.nodeSize }); }
    else cur = null;
  });
  return spans.find((s) => pos >= s.from && pos <= s.to) ?? null;
}

/** Remove tag `id` from the selection, or from the tagged stretch the cursor is in. */
export function removeTagHere(state: EditorState, id: string): Transaction | null {
  const { from, to, empty } = state.selection;
  const range = empty ? tagExtent(state.doc, from, id) : { from, to };
  if (!range) return null;
  return state.tr.removeMark(range.from, range.to, tagMark(id));
}

/** Remove an item everywhere: its text tags and its scene-level tags. */
export function removeTagEverywhere(state: EditorState, id: string): Transaction {
  const tr = state.tr.removeMark(0, state.doc.content.size, tagMark(id));
  state.doc.forEach((node, offset) => {
    const tags: string[] | null = node.attrs.tags;
    if (tags?.includes(id)) {
      const rest = tags.filter((t) => t !== id);
      tr.setNodeAttribute(offset, 'tags', rest.length ? rest : null);
    }
  });
  return tr;
}

/** Re-point every use of `fromId` at `toId` (used when renaming one item into another). */
export function mergeTag(state: EditorState, fromId: string, toId: string): Transaction {
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((m) => isTag(m) && m.attrs.id === fromId)) {
      tr.removeMark(pos, pos + node.nodeSize, tagMark(fromId));
      tr.addMark(pos, pos + node.nodeSize, tagMark(toId));
    }
    const tags: string[] | null = node.attrs.tags;
    if (node.type === schema.nodes.element && tags?.includes(fromId)) {
      const next = [...new Set(tags.map((t) => (t === fromId ? toId : t)))];
      tr.setNodeAttribute(pos, 'tags', next);
    }
    return node.type === schema.nodes.doc || node.type === schema.nodes.element;
  });
  return tr;
}

/** Document position of the start of element `index`. */
export function elementPos(doc: PMNode, index: number): number {
  let pos = -1;
  doc.forEach((_n, offset, i) => { if (i === index) pos = offset; });
  return pos;
}

/** Add or remove a scene-level tag on the element at `index` (a scene heading). */
export function setSceneTag(state: EditorState, index: number, id: string, on: boolean): Transaction | null {
  const pos = elementPos(state.doc, index);
  if (pos < 0) return null;
  const tags: string[] = state.doc.child(index).attrs.tags ?? [];
  const next = on ? [...new Set([...tags, id])] : tags.filter((t) => t !== id);
  return state.tr.setNodeAttribute(pos, 'tags', next.length ? next : null);
}

/** Tag ids under the cursor (or anywhere in the selection). */
export function tagsAtSelection(state: EditorState): string[] {
  const { from, to, empty, $from } = state.selection;
  const ids = new Set<string>();
  const collect = (marks: readonly Mark[]) => marks.forEach((m) => { if (isTag(m)) ids.add(m.attrs.id); });
  if (empty) {
    collect($from.nodeBefore?.marks ?? []);
    collect($from.nodeAfter?.marks ?? []);
  } else {
    state.doc.nodesBetween(from, to, (n) => { if (n.isText) collect(n.marks); });
  }
  return [...ids];
}

/**
 * Tag every character: one Cast item per speaker name, tagged on its cues and
 * wherever the name appears in action. Existing Cast items are reused.
 */
export function autoTagCharacters(
  state: EditorState, dt: DocTypeDef, items: TagItem[], newId: () => string,
): { tr: Transaction; items: TagItem[]; added: number } {
  const names = new Map<string, string>();
  state.doc.forEach((node) => {
    if (!getElement(dt, node.attrs.type).speaker) return;
    const name = speakerName(node.textContent);
    if (name && !names.has(name.toUpperCase())) names.set(name.toUpperCase(), name.toUpperCase());
  });
  const nextItems = [...items];
  let added = 0;
  const tr = state.tr;
  const include = (type: string) => {
    const el = getElement(dt, type);
    return !!el.speaker || (!el.speech && !el.sceneStart && !el.sectionStart && el.smartType !== 'transition');
  };
  for (const name of names.values()) {
    let item = findItem(nextItems, 'cast', name);
    if (!item) { item = { id: newId(), category: 'cast', name }; nextItems.push(item); added++; }
    addTag(tr, findMentions(tr.doc, name, include), item.id);
  }
  return { tr, items: nextItems, added };
}

/** Every place item `id` is used, in document order: tagged stretches, then scene-level tags as their element. */
export function tagRanges(doc: PMNode, id: string): Range[] {
  const out: Range[] = [];
  doc.forEach((node, offset) => {
    if ((node.attrs.tags as string[] | null)?.includes(id)) out.push({ from: offset + 1, to: offset + 1 + node.content.size });
    let cur: Range | null = null;
    node.forEach((child, off) => {
      const from = offset + 1 + off;
      if (child.marks.some((m) => isTag(m) && m.attrs.id === id)) {
        if (cur && cur.to === from) cur.to = from + child.nodeSize;
        else { cur = { from, to: from + child.nodeSize }; out.push(cur); }
      } else cur = null;
    });
  });
  return out.sort((a, b) => a.from - b.from || b.to - a.to);
}

/** The selection, or the word around the cursor if nothing is selected. */
export function selectionOrWord(state: EditorState): Range | null {
  const { from, to, empty, $from } = state.selection;
  if (!empty) return { from, to };
  const text = $from.parent.textBetween(0, $from.parent.content.size, undefined, '\n');
  const at = $from.parentOffset;
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}'’-]/u.test(c);
  let a = at, b = at;
  while (isWord(text[a - 1])) a--;
  while (isWord(text[b])) b++;
  if (a === b) return null;
  const start = $from.start();
  return { from: start + a, to: start + b };
}
