import { DocTypeDef, ElementDef, getElement } from '../doctypes';
import { Block, Run, blockText, printedRuns } from '../model';

// Lays a script out into printed pages the way Final Draft does:
// Courier 12pt (10 chars/inch, 6 lines/inch), 1" top/bottom margins,
// headings kept with what follows, and speeches split with (MORE)/(CONT'D).

export const LINES_PER_PAGE = 54;
export const CHARS_PER_INCH = 10;

export interface Segment extends Omit<Run, 'text'> { text: string }
export interface Line {
  segments: Segment[];
  /** Left edge in inches. */
  left: number;
  width: number;
  align: 'left' | 'center' | 'right';
  /** Scene number to print in the margins, on a scene heading's first line. */
  sceneNumber?: number;
}
/** A page is a list of slots; `null` is a blank line. */
export type Page = (Line | null)[];

export interface PaginateOptions { sceneNumbers?: boolean }

/** Word-wrap styled runs to a width in characters, keeping run styles. */
export function wrapRuns(runs: Run[], widthChars: number, upper = false): Segment[][] {
  const chars: { c: string; s: Omit<Run, 'text'> }[] = [];
  for (const r of runs) {
    const { text, ...s } = r;
    for (const c of upper ? text.toUpperCase() : text) chars.push({ c, s });
  }
  const lines: (typeof chars)[] = [];
  let start = 0;
  while (start <= chars.length) {
    // Hard line break.
    const nl = chars.findIndex((x, i) => i >= start && x.c === '\n');
    const hardEnd = nl === -1 ? chars.length : nl;
    if (hardEnd - start <= widthChars) {
      lines.push(chars.slice(start, hardEnd));
      if (nl === -1) break;
      start = nl + 1;
      continue;
    }
    // Break at the last space that fits; fall back to a hard cut.
    let brk = -1;
    for (let i = start + widthChars; i > start; i--) if (chars[i]?.c === ' ') { brk = i; break; }
    if (brk === -1) { lines.push(chars.slice(start, start + widthChars)); start += widthChars; }
    else { lines.push(chars.slice(start, brk)); start = brk + 1; }
  }
  return lines.map((cs) => {
    const segs: Segment[] = [];
    for (const { c, s } of cs) {
      const prev = segs[segs.length - 1];
      if (prev && !!prev.bold === !!s.bold && !!prev.italic === !!s.italic && !!prev.underline === !!s.underline) prev.text += c;
      else segs.push({ text: c, ...s });
    }
    return segs;
  });
}

function styledRuns(b: Block, el: ElementDef): Run[] {
  let runs: Run[] = printedRuns(b.runs).map((r) => ({
    ...r,
    bold: r.bold || el.bold || undefined,
    italic: r.italic || el.italic || undefined,
    underline: r.underline || el.underline || undefined,
  }));
  if (el.wrap) runs = [{ text: el.wrap[0] }, ...runs, { text: el.wrap[1] }];
  return runs;
}

function linesFor(b: Block, el: ElementDef, sceneNumber?: number): Line[] {
  const widthChars = Math.round(el.width * CHARS_PER_INCH);
  return wrapRuns(styledRuns(b, el), widthChars, el.uppercase).map((segments, i) => ({
    segments, left: el.left, width: el.width, align: el.align ?? 'left',
    ...(i === 0 && sceneNumber !== undefined && { sceneNumber }),
  }));
}

export function paginate(dt: DocTypeDef, blocks: Block[], opts: PaginateOptions = {}): Page[] {
  return layout(dt, blocks, opts).pages;
}

/** Where a printed page begins: the block whose lines start it, and whether it starts partway through that block. */
export interface PageStart { block: number; mid: boolean }

/** Page starts for pages 2..N, used to draw page breaks on screen. */
export function pageStarts(dt: DocTypeDef, blocks: Block[]): PageStart[] {
  return layout(dt, blocks, {}).starts.slice(1);
}

function layout(dt: DocTypeDef, blocks: Block[], opts: PaginateOptions): { pages: Page[]; starts: PageStart[] } {
  const pages: Page[] = [];
  const starts: PageStart[] = [];
  let page: Page = [];
  let cur = 0;
  let curStarted = false;
  const newPage = () => { if (page.length) pages.push(page); page = []; };
  // Every line goes through here so we know which block opens each page.
  const push = (...ls: Page) => {
    if (!ls.length) return;
    if (!page.length) starts[pages.length] = { block: cur, mid: curStarted };
    page.push(...ls);
    if (ls.some((l) => l !== null)) curStarted = true;
  };
  const room = () => LINES_PER_PAGE - page.length;
  const speaker = dt.elements.find((e) => e.speaker);

  let sceneNo = 0;
  let currentSpeaker: string | null = null;
  const contdLine = (): Line | null => (speaker && currentSpeaker
    ? linesFor({ type: speaker.id, runs: [{ text: `${currentSpeaker} (CONT'D)` }] }, speaker)[0] : null);
  const moreLine = (): Line | null => (speaker
    ? linesFor({ type: speaker.id, runs: [{ text: '(MORE)' }] }, speaker)[0] : null);

  const items = blocks.map((b) => {
    const el = getElement(dt, b.type);
    const num = el.sceneStart && opts.sceneNumbers ? ++sceneNo : undefined;
    return { b, el, lines: linesFor(b, el, num) };
  });

  items.forEach(({ b, el, lines }, idx) => {
    cur = idx; curStarted = false;
    if (el.speaker) currentSpeaker = blockText(b).toUpperCase().replace(/\s*\(CONT'D\)\s*$/i, '');
    else if (!el.speech) currentSpeaker = null;
    const continuingSpeech = el.speech && dt.moreContd && currentSpeaker !== null &&
      idx > 0 && (items[idx - 1].el.speech || items[idx - 1].el.speaker);

    if (el.pageBreakBefore && page.length) newPage();
    const gap = () => (page.length ? el.spaceBefore : 0);

    // Lines this block needs to keep company with what follows.
    let need = gap() + lines.length;
    if (el.keepWithNext) {
      const nxt = items[idx + 1];
      if (nxt) need += nxt.el.spaceBefore + Math.min(nxt.lines.length, 2);
    }

    if (need <= room()) {
      for (let i = 0; i < gap(); i++) push(null);
      push(...lines);
      return;
    }

    const usable = room() - gap() - (el.speech && dt.moreContd ? 1 : 0);
    if (el.splittable && page.length && usable >= 2 && lines.length - usable >= 2) {
      for (let i = 0, g = gap(); i < g; i++) push(null);
      push(...lines.slice(0, usable));
      if (el.speech && dt.moreContd) { const m = moreLine(); if (m) push(m); }
      newPage();
      if (el.speech && dt.moreContd) { const c = contdLine(); if (c) push(c); }
      let rest = lines.slice(usable);
      while (rest.length > LINES_PER_PAGE - page.length) {
        const n = LINES_PER_PAGE - page.length;
        push(...rest.slice(0, n)); rest = rest.slice(n); newPage();
      }
      push(...rest);
      return;
    }

    // Move the whole block to the next page.
    if (continuingSpeech && page.length && room() > 0) { const m = moreLine(); if (m) push(m); }
    newPage();
    if (continuingSpeech) { const c = contdLine(); if (c) push(c); }
    let rest = lines;
    while (rest.length > LINES_PER_PAGE - page.length) {
      const n = LINES_PER_PAGE - page.length;
      push(...rest.slice(0, n)); rest = rest.slice(n); newPage();
    }
    push(...rest);
  });
  newPage();
  return { pages: pages.length ? pages : [[]], starts };
}
