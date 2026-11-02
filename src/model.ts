/**
 * Format-neutral script model shared by importers, exporters and the PDF
 * paginator. The editor converts to/from this with `toScript` / `fromScript`.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface Block {
  type: string;
  runs: Run[];
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

/** Merge adjacent runs that share the same styling and drop empty runs. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (prev && !!prev.bold === !!r.bold && !!prev.italic === !!r.italic && !!prev.underline === !!r.underline) {
      prev.text += r.text;
    } else {
      const n: Run = { text: r.text };
      if (r.bold) n.bold = true;
      if (r.italic) n.italic = true;
      if (r.underline) n.underline = true;
      out.push(n);
    }
  }
  return out;
}
