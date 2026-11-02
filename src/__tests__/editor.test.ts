import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { screenplay } from '../doctypes/screenplay';
import { enterCommand, tabCommand } from '../editor/commands';
import { docToBlocks, scriptToDoc } from '../editor/schema';
import { getSuggestions } from '../editor/smarttype';
import { blockText, plainBlock as b } from '../model';

function stateWith(blocks: ReturnType<typeof b>[]) {
  const doc = scriptToDoc({ docType: 'screenplay', titlePage: {} as never, blocks }, 'scene_heading');
  const s = EditorState.create({ doc });
  return s.apply(s.tr.setSelection(TextSelection.atEnd(doc)));
}
function run(state: EditorState, cmd: ReturnType<typeof enterCommand>) {
  let next = state;
  cmd(state, (tr) => { next = state.apply(tr); });
  return next;
}
const types = (s: EditorState) => docToBlocks(s.doc).map((x) => x.type);

describe('editor commands', () => {
  it('Enter after a character starts dialogue, then action', () => {
    let s = stateWith([b('character', 'MARA')]);
    s = run(s, enterCommand(screenplay));
    expect(types(s)).toEqual(['character', 'dialogue']);
    s = s.apply(s.tr.insertText('Hi.'));
    s = run(s, enterCommand(screenplay));
    expect(types(s)).toEqual(['character', 'dialogue', 'action']);
  });

  it('Tab on empty action becomes character, then transition', () => {
    let s = stateWith([b('action', '')]);
    s = run(s, tabCommand(screenplay));
    expect(types(s)).toEqual(['character']);
    s = run(s, tabCommand(screenplay));
    expect(types(s)).toEqual(['transition']);
  });

  it('Tab at the end of dialogue starts a parenthetical with ()', () => {
    let s = stateWith([b('character', 'MARA'), b('dialogue', 'Hi.')]);
    s = run(s, tabCommand(screenplay));
    const blocks = docToBlocks(s.doc);
    expect(blocks.map((x) => x.type)).toEqual(['character', 'dialogue', 'parenthetical']);
    expect(blockText(blocks[2])).toBe('()');
    expect(s.selection.$from.parentOffset).toBe(1);
  });
});

describe('smarttype', () => {
  const others = [b('scene_heading', 'INT. KITCHEN - DAY'), b('character', 'MARA'), b('character', 'Mara (V.O.)'), b('character', 'MAX')];
  it('suggests characters by frequency', () => {
    expect(getSuggestions(screenplay, 'character', 'ma', others)?.items).toEqual(['MARA', 'MAX']);
  });
  it('suggests locations then times in scene headings', () => {
    expect(getSuggestions(screenplay, 'scene_heading', 'int. k', others)).toMatchObject({ from: 5, items: ['KITCHEN'], suffix: ' - ' });
    expect(getSuggestions(screenplay, 'scene_heading', 'INT. KITCHEN - N', others)?.items).toEqual(['NIGHT']);
  });
});
