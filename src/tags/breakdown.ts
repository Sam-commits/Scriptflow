import { DocTypeDef, getElement } from '../doctypes';
import { Block, Script, TagItem, blockText } from '../model';
import { TAG_CATEGORIES, TagCategory, allTagTypes, getCategory } from './categories';

/** Names compare without case or extra spaces: "the Watch" is the same item as "THE WATCH". */
export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

export function findItem(items: TagItem[], category: string, name: string): TagItem | undefined {
  const n = normName(name);
  return items.find((i) => i.category === category && normName(i.name) === n);
}

/** "MARA (V.O.)" -> "MARA", "MAX (CONT'D) ^" -> "MAX". */
export function speakerName(cue: string): string {
  return cue.replace(/\^\s*$/, '').replace(/\s*\([^)]*\)/g, '').trim();
}

export interface SceneRange {
  /** Scene number, 0 for anything before the first scene heading. */
  num: number;
  heading: string;
  /** Block index of the scene heading (or 0) and one past the scene's last block. */
  start: number;
  end: number;
}

export function sceneRanges(dt: DocTypeDef, blocks: Block[]): SceneRange[] {
  const out: SceneRange[] = [];
  let n = 0;
  blocks.forEach((b, i) => {
    if (!getElement(dt, b.type).sceneStart) return;
    if (out.length) out[out.length - 1].end = i;
    else if (i > 0) out.push({ num: 0, heading: 'Before the first scene', start: 0, end: i });
    out.push({ num: ++n, heading: blockText(b) || '(untitled scene)', start: i, end: blocks.length });
  });
  if (!out.length && blocks.length) out.push({ num: 0, heading: 'Whole script', start: 0, end: blocks.length });
  return out;
}

/** The scene containing a block index. */
export function sceneAt(ranges: SceneRange[], index: number): SceneRange | undefined {
  return ranges.find((r) => index >= r.start && index < r.end);
}

/**
 * How many times each tag item appears in these blocks. A tagged stretch of
 * text counts once even if it spans styled runs; a scene-level tag counts once.
 */
export function countTags(blocks: Block[]): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const b of blocks) {
    let prev = new Set<string>();
    for (const r of b.runs) {
      const cur = new Set(r.tags ?? []);
      for (const id of cur) if (!prev.has(id)) bump(id);
      // A line break inside a tagged stretch doesn't start a new mention.
      if (r.text !== '\n') prev = cur;
    }
    for (const id of b.tags ?? []) bump(id);
  }
  return counts;
}

export interface SceneBreakdown {
  scene: SceneRange;
  /** Items in this scene, by category in category order, then by name. */
  groups: { category: string; items: { item: TagItem; count: number; sceneLevel: boolean }[] }[];
}

const byName = (a: TagItem, b: TagItem) => a.name.localeCompare(b.name);

/** Types in display order, plus any category an item uses that isn't in the list (shown as "Other"). */
export function typesInUse(types: TagCategory[], items: TagItem[]): TagCategory[] {
  const known = new Set(types.map((t) => t.id));
  const extra = [...new Set(items.map((i) => i.category).filter((c) => !known.has(c)))].map((c) => getCategory(c, types));
  return [...types, ...extra];
}

export function sceneBreakdown(scene: SceneRange, blocks: Block[], items: TagItem[], types: TagCategory[] = TAG_CATEGORIES): SceneBreakdown {
  const slice = blocks.slice(scene.start, scene.end);
  const counts = countTags(slice);
  const sceneLevel = new Set(blocks[scene.start]?.tags ?? []);
  const groups = typesInUse(types, items).map((c) => ({
    category: c.id,
    items: items.filter((i) => i.category === c.id && counts.has(i.id)).sort(byName)
      .map((item) => ({ item, count: counts.get(item.id)!, sceneLevel: sceneLevel.has(item.id) })),
  })).filter((g) => g.items.length);
  return { scene, groups };
}

/** Scene numbers each item appears in. */
export function scenesByItem(dt: DocTypeDef, blocks: Block[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const s of sceneRanges(dt, blocks)) {
    for (const id of countTags(blocks.slice(s.start, s.end)).keys()) {
      const list = out.get(id) ?? [];
      list.push(s.num);
      out.set(id, list);
    }
  }
  return out;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A breakdown sheet as CSV: one row per element per scene. Opens in Excel, Numbers or Google Sheets. */
export function breakdownCsv(dt: DocTypeDef, script: Script): string {
  const items = script.tags ?? [];
  const types = allTagTypes(script);
  const rows: (string | number)[][] = [['Scene', 'Scene heading', 'Category', 'Element', 'Mentions', 'Notes']];
  for (const s of sceneRanges(dt, script.blocks)) {
    for (const g of sceneBreakdown(s, script.blocks, items, types).groups) {
      for (const { item, count } of g.items) {
        rows.push([s.num || '', s.heading, getCategory(g.category, types).name, item.name, count, item.notes ?? '']);
      }
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
