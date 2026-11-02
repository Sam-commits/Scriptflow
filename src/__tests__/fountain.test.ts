import { describe, expect, it } from 'vitest';
import { parseFountain, toFountain } from '../io/fountain';
import { blockText } from '../model';
import { sampleScreenplay } from '../sample';

const src = `Title: Big Fish
Credit: Written by
Author: John August

INT. KITCHEN - DAY

Will pours *coffee* and **stares**.

WILL
(quietly)
Dad?
Are you up?

CUT TO:

EXT. RIVER - NIGHT #12#

@McCLANE
Yippee.

> FADE OUT.
`;

describe('fountain', () => {
  it('parses elements and the title page', () => {
    const s = parseFountain(src);
    expect(s.titlePage.title).toBe('Big Fish');
    expect(s.titlePage.author).toBe('John August');
    expect(s.blocks.map((b) => b.type)).toEqual([
      'scene_heading', 'action', 'character', 'parenthetical', 'dialogue',
      'transition', 'scene_heading', 'character', 'dialogue', 'transition',
    ]);
    expect(blockText(s.blocks[4])).toBe('Dad?\nAre you up?');
    expect(blockText(s.blocks[6])).toBe('EXT. RIVER - NIGHT');
    expect(blockText(s.blocks[7])).toBe('McCLANE');
    expect(s.blocks[1].runs).toEqual([
      { text: 'Will pours ' }, { text: 'coffee', italic: true }, { text: ' and ' },
      { text: 'stares', bold: true }, { text: '.' },
    ]);
  });

  it('round-trips a script through Fountain', () => {
    const again = parseFountain(toFountain(sampleScreenplay));
    expect(again.titlePage.title).toBe(sampleScreenplay.titlePage.title);
    expect(again.blocks.map((b) => b.type)).toEqual(sampleScreenplay.blocks.map((b) => b.type));
    // Character names are uppercased on export; everything else matches exactly.
    again.blocks.forEach((b, i) => {
      const orig = sampleScreenplay.blocks[i];
      const want = ['character', 'scene_heading', 'transition'].includes(orig.type) ? blockText(orig).toUpperCase() : blockText(orig);
      expect(blockText(b)).toBe(want);
    });
  });

  it('forces action lines that would be misread', () => {
    const s = { ...sampleScreenplay, blocks: [{ type: 'action', runs: [{ text: 'BOOM' }] }, { type: 'action', runs: [{ text: 'int. this is action' }] }] };
    const again = parseFountain(toFountain(s));
    expect(again.blocks.map((b) => [b.type, blockText(b)])).toEqual([['action', 'BOOM'], ['action', 'int. this is action']]);
  });

  it('keeps literal asterisks and underscores', () => {
    const s = { ...sampleScreenplay, blocks: [{ type: 'action', runs: [{ text: '5 * 3 = snake_case' }] }] };
    expect(blockText(parseFountain(toFountain(s)).blocks[0])).toBe('5 * 3 = snake_case');
  });
});
