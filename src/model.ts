/**
 * Format-neutral script model shared by importers, exporters and the PDF
 * paginator. The editor converts to/from this with `toScript` / `fromScript`.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Ids of the tag items (see `TagItem`) this text is tagged with. */
  tags?: string[];
}

export interface Block {
  type: string;
  runs: Run[];
  /** Tag items attached to the whole block without marking any text. Used on
   *  scene headings for elements a scene needs that the script never mentions. */
  tags?: string[];
  /** Grey placeholder shown while the element is empty (from the scene builder). Never printed. */
  hint?: string;
  /** A writer's note on the element, e.g. a scene's goal, conflict and turn. Never printed. */
  note?: string;
}

/** One breakdown element: a character, prop, location, shot and so on. */
export interface TagItem {
  id: string;
  /** A category id from src/tags/categories.ts. */
  category: string;
  name: string;
  notes?: string;
}

export interface TitlePage {
  title: string;
  credit: string;
  author: string;
  source: string;
  draftDate: string;
  contact: string;
}

export interface Script {
  docType: string;
  titlePage: TitlePage;
  blocks: Block[];
  /** Breakdown elements tagged in this script. Missing in older files. */
  tags?: TagItem[];
}

export const emptyTitlePage = (): TitlePage => ({
  title: '', credit: 'Written by', author: '', source: '', draftDate: '', contact: '',
});

export function blockText(b: Block): string {
  return b.runs.map((r) => r.text).join('');
}

export function plainBlock(type: string, text: string): Block {
  return { type, runs: text ? [{ text }] : [] };
}

const tagKey = (r: Run) => (r.tags?.length ? [...r.tags].sort().join(' ') : '');

/** Merge adjacent runs that share the same styling and tags, and drop empty runs. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (prev && !!prev.bold === !!r.bold && !!prev.italic === !!r.italic && !!prev.underline === !!r.underline
      && tagKey(prev) === tagKey(r)) {
      prev.text += r.text;
    } else {
      const n: Run = { text: r.text };
      if (r.bold) n.bold = true;
      if (r.italic) n.italic = true;
      if (r.underline) n.underline = true;
      if (r.tags?.length) n.tags = [...r.tags].sort();
      out.push(n);
    }
  }
  return out;
}

/** Runs with tags removed and styles merged again: what exporters print. */
export function printedRuns(runs: Run[]): Run[] {
  return normalizeRuns(runs.map(({ tags: _t, ...r }) => r));
}
