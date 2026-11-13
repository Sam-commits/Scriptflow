import { Command, EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { DocTypeDef, getElement } from '../doctypes';
import { schema } from './schema';

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
