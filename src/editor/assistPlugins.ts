import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { AssistSettings } from '../assist/levels';
import { checkFormat, visibleIssues } from '../assist/coach';
import { DocTypeDef, getElement } from '../doctypes';
import { docToBlocks } from './schema';

/** Ghost text waiting at the cursor. Display only: it is not in the document until accepted. */
export interface Ghost { pos: number; text: string }

export const ghostKey = new PluginKey<Ghost | null>('ghost');

export function ghostPlugin() {
  return new Plugin<Ghost | null>({
    key: ghostKey,
    state: {
      init: () => null,
      apply(tr, prev) {
        const meta = tr.getMeta(ghostKey);
        if (meta !== undefined) return meta as Ghost | null;
        return tr.docChanged || tr.selectionSet ? null : prev;
      },
    },
    props: {
      decorations(state) {
        const g = ghostKey.getState(state);
        if (!g) return null;
        return DecorationSet.create(state.doc, [Decoration.widget(g.pos, () => {
          const span = document.createElement('span');
          span.className = 'ghost';
          span.textContent = g.text;
          span.setAttribute('aria-hidden', 'true');
          return span;
        }, { side: 1, key: `ghost:${g.pos}:${g.text}`, ignoreSelection: true })]);
      },
    },
  });
}

/**
 * Grey hints in empty elements: the scene builder's hints wherever they are,
 * and (at the "all" setting) a short prompt for the empty element the cursor is in.
 * Hints clear themselves once the element has text.
 */
export function hintsPlugin(dt: DocTypeDef, settings: () => AssistSettings) {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      const tr = state.tr;
      state.doc.forEach((node, offset) => {
        if (node.attrs.hint && node.content.size > 0) tr.setNodeAttribute(offset, 'hint', null);
      });
      return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
    },
    props: {
      decorations(state) {
        const mode = settings().hints;
        const decos: Decoration[] = [];
        const cursor = state.selection.$from.index(0);
        state.doc.forEach((node, offset, i) => {
          // The element with the cursor shows its margin note in full.
          if (i === cursor && node.attrs.note) decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'cursor-el' }));
          if (node.content.size > 0 || mode === 'off') return;
          const hint = (node.attrs.hint as string | null) ?? (mode === 'all' && i === cursor ? getElement(dt, node.attrs.type).hint : null);
          if (hint) decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'hint', 'data-hint': hint }));
        });
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}

export const coachKey = new PluginKey<DecorationSet>('coach');

/** Soft underlines from the format coach. Refreshes on every edit, or on a `coachKey` meta. */
export function coachPlugin(dt: DocTypeDef, settings: () => AssistSettings) {
  const build = (doc: Parameters<typeof DecorationSet.create>[0]) => {
    const level = settings().formatCoach;
    if (level === 'off') return DecorationSet.empty;
    const starts: number[] = [];
    doc.forEach((_n, offset) => starts.push(offset));
    const issues = visibleIssues(checkFormat(dt, docToBlocks(doc)), level);
    const decos = issues.map((x) => {
      const node = doc.child(x.index);
      const base = starts[x.index] + 1;
      const from = base + (x.from ?? 0);
      const to = base + (x.to ?? node.content.size);
      return Decoration.inline(from, to, { class: `coach${x.serious ? ' serious' : ''}`, title: x.message });
    });
    return DecorationSet.create(doc, decos);
  };
  return new Plugin<DecorationSet>({
    key: coachKey,
    state: {
      init: (_c, state) => build(state.doc),
      apply: (tr, prev, _old, state) => (tr.docChanged || tr.getMeta(coachKey) ? build(state.doc) : prev),
    },
    props: { decorations: (state) => coachKey.getState(state) },
  });
}
