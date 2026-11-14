import { Command, EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { DocTypeDef, getElement } from '../doctypes';
import { Block } from '../model';
import { blockToNode, schema } from './schema';

function currentBlock(state: EditorState) {
  const $from = state.selection.$from;
  return { node: $from.parent, start: $from.start(), end: $from.end(), offset: $from.parentOffset };
}

/** Change the current element's type, adding/removing "()" for parentheticals. */
export function setElementType(type: string): Command {
  return (state, dispatch) => {
    const { node, start, end } = currentBlock(state);
    if (!dispatch) return true;
    let tr = state.tr.setNodeMarkup(start - 1, undefined, { ...node.attrs, type });
    if (node.attrs.type === 'parenthetical' && node.textContent === '()') {
      tr = tr.delete(start, end);
    }
    if (type === 'parenthetical' && node.content.size === 0) {
      tr = tr.insertText('()', start);
      tr = tr.setSelection(TextSelection.create(tr.doc, start + 1));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

function insertBlockAfter(tr: Transaction, pos: number, type: string): Transaction {
  const node = schema.nodes.element.create({ type }, type === 'parenthetical' ? schema.text('()') : undefined);
  tr = tr.insert(pos, node);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1 + (type === 'parenthetical' ? 1 : 0)));
}

/** Enter: start the element that naturally follows this one. */
export function enterCommand(dt: DocTypeDef): Command {
  return (state, dispatch) => {
    if (!state.selection.empty) return false;
    const { node, end, offset } = currentBlock(state);
    const el = getElement(dt, node.attrs.type);
    if (!dispatch) return true;

    // Enter on an empty element switches it to the "next" element instead.
    if (node.content.size === 0 && el.next !== el.id) {
      return setElementType(el.next)(state, dispatch);
    }
    // Inside a parenthetical, Enter jumps past the closing ")".
    const atEnd = offset === node.content.size ||
      (node.attrs.type === 'parenthetical' && node.textContent.endsWith(')') && offset === node.content.size - 1);
    if (atEnd) {
      // A scene-builder placeholder waiting below (perhaps under its character cue):
      // move into it instead of adding a line.
      let at = end + 1;
      let below = state.doc.nodeAt(at);
      if (below && below.content.size > 0 && getElement(dt, below.attrs.type).speaker) {
        at += below.nodeSize;
        below = state.doc.nodeAt(at);
      }
      if (below && below.content.size === 0 && below.attrs.hint) {
        dispatch(state.tr.setSelection(TextSelection.create(state.doc, at + 1)).scrollIntoView());
        return true;
      }
      dispatch(insertBlockAfter(state.tr, end + 1, el.next).scrollIntoView());
      return true;
    }
    // Middle of a block: split it, both halves keep the same element.
    // Scene-level tags stay with the first half.
    const after = [{ type: schema.nodes.element, attrs: { type: node.attrs.type, tags: null } }];
    dispatch(state.tr.split(state.selection.from, 1, after).scrollIntoView());
    return true;
  };
}

/** Tab: on an empty element cycle its type; at the end of one start the Tab element. */
export function tabCommand(dt: DocTypeDef, reverse = false): Command {
  return (state, dispatch) => {
    const { node, end, offset } = currentBlock(state);
    const el = getElement(dt, node.attrs.type);
    const target = reverse ? el.shiftTab : el.tab;
    if (!target) return true;
    const empty = node.content.size === 0 || (node.attrs.type === 'parenthetical' && node.textContent === '()');
    if (empty) return setElementType(target)(state, dispatch);
    if (!reverse && offset >= node.content.size - (node.attrs.type === 'parenthetical' ? 1 : 0)) {
      if (dispatch) dispatch(insertBlockAfter(state.tr, end + 1, target).scrollIntoView());
      return true;
    }
    return true; // swallow Tab so focus never leaves the page
  };
}

export const hardBreak: Command = (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

/**
 * Put `blocks` in place of element `index` (or after it, if it has text), as one
 * undo step, with the cursor in the first empty element.
 */
export function replaceElementWith(state: EditorState, index: number, blocks: Block[]): Transaction | null {
  if (!blocks.length || index < 0 || index >= state.doc.childCount) return null;
  let pos = 0;
  state.doc.forEach((_n, offset, i) => { if (i === index) pos = offset; });
  const node = state.doc.child(index);
  const nodes = blocks.map(blockToNode);
  const tr = node.content.size === 0
    ? state.tr.replaceWith(pos, pos + node.nodeSize, nodes)
    : state.tr.insert(pos + node.nodeSize, nodes);
  const first = node.content.size === 0 ? pos : pos + node.nodeSize;
  let cursor = -1;
  let p = first;
  for (const n of nodes) {
    if (cursor < 0 && n.content.size === 0) cursor = p + 1;
    p += n.nodeSize;
  }
  if (cursor < 0) cursor = p - 1;
  return tr.setSelection(TextSelection.create(tr.doc, cursor)).scrollIntoView();
}
