import { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { PageStart } from '../io/paginate';

// Draws where printed pages begin, as widgets between paragraphs. The breaks
// come from the same paginate() the PDF uses, so the screen matches the print.
// A page that begins partway through a long speech or action is marked
// before that paragraph, since the editor keeps each paragraph whole.

export const pageBreakKey = new PluginKey<DecorationSet>('pageBreaks');

function widget(pageNo: number) {
  const el = document.createElement('div');
  el.className = 'pb';
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  const gap = document.createElement('div');
  gap.className = 'pb-gap';
  const num = document.createElement('div');
  num.className = 'pb-num';
  num.textContent = `${pageNo}.`;
  el.append(gap, num);
  return el;
}

export function breakDecorations(doc: Node, starts: PageStart[]): DecorationSet {
  const positions: number[] = [];
  doc.forEach((_n, offset) => positions.push(offset));
  const decos = starts
    .map((s, i) => ({ pos: positions[s.block], page: i + 2 }))
    .filter((d) => d.pos !== undefined && d.pos > 0)
    .map((d) => Decoration.widget(d.pos, () => widget(d.page), { side: -1, key: `pb${d.page}@${d.pos}`, ignoreSelection: true }));
  return DecorationSet.create(doc, decos);
}

export const pageBreakPlugin = () => new Plugin<DecorationSet>({
  key: pageBreakKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      const starts = tr.getMeta(pageBreakKey) as PageStart[] | undefined;
      if (starts) return breakDecorations(tr.doc, starts);
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: { decorations: (state) => pageBreakKey.getState(state) },
});
