import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { screenplay } from '../doctypes/screenplay';
import { setElementType, enterCommand } from '../editor/commands';
import { docToBlocks, scriptToDoc } from '../editor/schema';
import {
  addTag, autoTagCharacters, findMentions, mentionFilter, mergeTag, removeTagEverywhere, removeTagHere,
  setSceneTag, tagsAtSelection,
} from '../editor/tagging';
import { toFdx, toFountain } from '../io/files';
import { Block, Script, plainBlock as b } from '../model';
import { sampleScreenplay } from '../sample';
import { breakdownCsv, countTags, findItem, sceneBreakdown, sceneRanges, scenesByItem, speakerName } from '../tags/breakdown';
import { DEFAULT_APPEARANCE, builtinThemes, tagColorOn, themeTokens, tokensToCss } from '../themes';
import { contrast } from '../themes/contrast';
import { CATEGORY_IDS } from '../tags/categories';

const script = (blocks: Block[]): Script => ({ docType: 'screenplay', titlePage: {} as never, blocks });
const stateOf = (blocks: Block[]) => EditorState.create({ doc: scriptToDoc(script(blocks), 'scene_heading') });
const apply = (s: EditorState, tr: ReturnType<EditorState['tr']['addMark']> | null) => (tr ? s.apply(tr) : s);

const blocks = [
  b('scene_heading', 'INT. KITCHEN - DAY'),
  b('action', 'Mara drops the WATCH. The watch stops.'),
  b('character', 'MARA (V.O.)'),
  b('dialogue', 'My watch!'),
  b('scene_heading', 'EXT. YARD - NIGHT'),
  b('action', 'Max buries the watch.'),
  b('character', 'MAX'),
  b('dialogue', 'Gone.'),
];

describe('finding mentions', () => {
  it('matches whole words without case, skipping dialogue', () => {
    const s = stateOf(blocks);
    const found = findMentions(s.doc, 'watch', mentionFilter(screenplay));
    expect(found.map((r) => s.doc.textBetween(r.from, r.to))).toEqual(['WATCH', 'watch', 'watch']);
    expect(findMentions(s.doc, 'watc')).toEqual([]);
  });
});

describe('tag marks', () => {
  it('round-trip through the script model and count once per mention', () => {
    let s = stateOf(blocks);
    s = s.apply(addTag(s.tr, findMentions(s.doc, 'watch', mentionFilter(screenplay)), 'w1'));
    const out = docToBlocks(s.doc);
    expect(out[1].runs).toEqual([
      { text: 'Mara drops the ' }, { text: 'WATCH', tags: ['w1'] }, { text: '. The ' }, { text: 'watch', tags: ['w1'] }, { text: ' stops.' },
    ]);
    expect(countTags(out).get('w1')).toBe(3);
    // Reloading the saved blocks gives the same document.
    expect(scriptToDoc(script(out), 'action').eq(s.doc)).toBe(true);
  });

  it('lets one stretch of text carry two tags', () => {
    let s = stateOf([b('action', 'A red hat.')]);
    s = s.apply(addTag(s.tr, [{ from: 3, to: 10 }], 'prop'));
    s = s.apply(addTag(s.tr, [{ from: 7, to: 10 }], 'ward'));
    expect(docToBlocks(s.doc)[0].runs).toEqual([
      { text: 'A ' }, { text: 'red ', tags: ['prop'] }, { text: 'hat', tags: ['prop', 'ward'] }, { text: '.' },
    ]);
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 8)));
    expect(tagsAtSelection(s).sort()).toEqual(['prop', 'ward']);
  });

  it('removes one stretch under the cursor, or an item everywhere', () => {
    let s = stateOf(blocks);
    s = s.apply(addTag(s.tr, findMentions(s.doc, 'watch', mentionFilter(screenplay)), 'w1'));
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 38)));
    s = apply(s, removeTagHere(s, 'w1'));
    expect(countTags(docToBlocks(s.doc)).get('w1')).toBe(2);
    s = apply(s, setSceneTag(s, 0, 'w1', true));
    s = s.apply(removeTagEverywhere(s, 'w1'));
    expect(countTags(docToBlocks(s.doc)).has('w1')).toBe(false);
    expect(docToBlocks(s.doc)[0].tags).toBeUndefined();
  });

  it('merges one item into another', () => {
    let s = stateOf(blocks);
    s = s.apply(addTag(s.tr, [{ from: 1, to: 5 }], 'a'));
    s = apply(s, setSceneTag(s, 4, 'a', true));
    s = s.apply(mergeTag(s, 'a', 'b'));
    const c = countTags(docToBlocks(s.doc));
    expect([c.get('a'), c.get('b')]).toEqual([undefined, 2]);
  });

  it('leaves exports untouched', () => {
    const plain = script(sampleScreenplay.blocks);
    let s = stateOf(plain.blocks);
    s = s.apply(addTag(s.tr, findMentions(s.doc, 'lighthouse'), 'x'));
    s = s.apply(addTag(s.tr, findMentions(s.doc, 'Forty years'), 'y'));
    const tagged = { ...plain, blocks: docToBlocks(s.doc), tags: [{ id: 'x', category: 'locations', name: 'Lighthouse' }] };
    expect(toFountain(tagged)).toBe(toFountain(plain));
    expect(toFdx(tagged)).toBe(toFdx(plain));
  });
});

describe('scene-level tags', () => {
  it('stay with the scene heading through element changes and splits', () => {
    let s = stateOf(blocks);
    s = apply(s, setSceneTag(s, 0, 'rain', true));
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 4)));
    setElementType('action')(s, (tr) => { s = s.apply(tr); });
    setElementType('scene_heading')(s, (tr) => { s = s.apply(tr); });
    enterCommand(screenplay)(s, (tr) => { s = s.apply(tr); });
    const out = docToBlocks(s.doc);
    expect(out[0].tags).toEqual(['rain']);
    expect(out[1].tags).toBeUndefined();
  });
});

describe('auto-tagging characters', () => {
  it('creates one Cast item per speaker and tags cues and action', () => {
    let n = 0;
    const s0 = stateOf(blocks);
    const { tr, items, added } = autoTagCharacters(s0, screenplay, [{ id: 'old', category: 'cast', name: 'Max' }], () => `c${++n}`);
    expect(added).toBe(1);
    expect(items.map((i) => i.name)).toEqual(['Max', 'MARA']);
    const counts = countTags(docToBlocks(s0.apply(tr).doc));
    expect(counts.get('c1')).toBe(2); // action + cue
    expect(counts.get('old')).toBe(2);
  });

  it('strips extensions from cues', () => {
    expect(speakerName("MARA (V.O.) (CONT'D)")).toBe('MARA');
    expect(speakerName('MAX ^')).toBe('MAX');
  });
});

describe('breakdown', () => {
  const items = [
    { id: 'w', category: 'props', name: 'Watch' },
    { id: 'm', category: 'cast', name: 'MARA' },
    { id: 'r', category: 'effects', name: 'Rain, "heavy"' },
  ];
  let s = stateOf(blocks);
  s = s.apply(addTag(s.tr, findMentions(s.doc, 'watch', mentionFilter(screenplay)), 'w'));
  s = s.apply(addTag(s.tr, findMentions(s.doc, 'mara'), 'm'));
  s = apply(s, setSceneTag(s, 4, 'r', true));
  const tagged = docToBlocks(s.doc);

  it('splits the script into scenes', () => {
    expect(sceneRanges(screenplay, [b('action', 'Cold open.'), ...blocks]).map((r) => [r.num, r.start, r.end]))
      .toEqual([[0, 0, 1], [1, 1, 5], [2, 5, 9]]);
  });

  it('lists each scene’s elements by category', () => {
    const [one, two] = sceneRanges(screenplay, tagged).map((r) => sceneBreakdown(r, tagged, items));
    expect(one.groups.map((g) => [g.category, g.items.map((i) => `${i.item.name}×${i.count}`)]))
      .toEqual([['cast', ['MARA×2']], ['props', ['Watch×2']]]);
    expect(two.groups.map((g) => g.category)).toEqual(['props', 'effects']);
    expect(two.groups[1].items[0].sceneLevel).toBe(true);
    expect(scenesByItem(screenplay, tagged).get('w')).toEqual([1, 2]);
  });

  it('exports a CSV breakdown sheet', () => {
    const csv = breakdownCsv(screenplay, { ...script(tagged), tags: items });
    expect(csv.split('\r\n')[0]).toBe('Scene,Scene heading,Category,Element,Mentions,Notes');
    expect(csv).toContain('2,EXT. YARD - NIGHT,Effects,"Rain, ""heavy""",1,');
  });

  it('finds items by name regardless of case', () => {
    expect(findItem(items, 'props', '  the  watch ')).toBeUndefined();
    expect(findItem(items, 'props', 'WATCH')?.id).toBe('w');
  });
});

describe('tag colors', () => {
  it('are written as CSS variables with the theme', () => {
    const css = tokensToCss(themeTokens(DEFAULT_APPEARANCE, 'dark'), 'dark');
    for (const id of CATEGORY_IDS) for (const v of ['', '-soft', '-ui', '-ui-soft']) expect(css).toContain(`--tag-${id}${v}:#`);
  });

  it('follow the page, not the mode: Dark Desk tags its white page in deep colors', () => {
    const desk = builtinThemes.find((t) => t.id === 'dark-desk')!;
    expect(tagColorOn('props', desk.tokens.page).strong).toBe('#7c3aed');
    expect(tagColorOn('props', desk.tokens.panel).strong).toBe('#a78bfa');
  });

  for (const t of builtinThemes) {
    it(`are readable in ${t.name}`, () => {
      for (const id of CATEGORY_IDS) {
        const page = tagColorOn(id, t.tokens.page);
        expect(contrast(page.strong, t.tokens.page), `${id} underline`).toBeGreaterThanOrEqual(3);
        expect(contrast(t.tokens.pageText, page.soft), `${id} text on highlight`).toBeGreaterThanOrEqual(4.5);
        const ui = tagColorOn(id, t.tokens.panel);
        expect(contrast(ui.strong, t.tokens.panel), `${id} chip`).toBeGreaterThanOrEqual(3);
        const draft = tagColorOn(id, t.tokens.bg);
        expect(contrast(t.tokens.text, draft.soft), `${id} draft view`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
