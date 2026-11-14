import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  AssistConfig, DEFAULT_ASSIST, addCustom, effectiveSettings, exportCustoms, getLevel, ghostOn, importCustoms, normalizeAssist,
  removeCustom, updateCustom,
} from '../assist/levels';
import { checkFormat, visibleIssues } from '../assist/coach';
import { phrase, predict } from '../assist/predict';
import { matchCase, renameCharacter, renameLocation } from '../assist/rename';
import { matchSlash, slashCommands, slashQuery } from '../assist/slash';
import { screenplay } from '../doctypes/screenplay';
import { stageplay } from '../doctypes/stageplay';
import { enterCommand, replaceElementWith } from '../editor/commands';
import { docToBlocks, scriptToDoc } from '../editor/schema';
import { getSuggestions, likelySpeakers, parseHeading } from '../editor/smarttype';
import { Block, TagItem, blockText, plainBlock as b } from '../model';
import { STRUCTURES, layoutOf, structuresFor } from '../structures';

const texts = (s: { items: { text: string }[] } | null) => s?.items.map((i) => i.text) ?? [];

function suggest(blocks: Block[], before: string, type: string, extra: Partial<Parameters<typeof getSuggestions>[0]> = {}) {
  const all = [...blocks, b(type, before)];
  return getSuggestions({ dt: screenplay, blocks: all, index: all.length - 1, before, ...extra });
}

function stateWith(blocks: Block[], atEndOf?: number) {
  const doc = scriptToDoc({ docType: 'screenplay', titlePage: {} as never, blocks }, 'scene_heading');
  const s = EditorState.create({ doc });
  if (atEndOf === undefined) return s.apply(s.tr.setSelection(TextSelection.atEnd(doc)));
  let pos = 0;
  doc.forEach((n, off, i) => { if (i === atEndOf) pos = off + 1 + n.content.size; });
  return s.apply(s.tr.setSelection(TextSelection.create(doc, pos)));
}

describe('assistance levels', () => {
  it('has three presets that differ in how much they help', () => {
    expect(getLevel('beginner').settings.formatCoach).toBe('all');
    expect(getLevel('intermediate').settings.formatCoach).toBe('serious');
    expect(getLevel('professional').settings.formatCoach).toBe('off');
    expect(getLevel('professional').settings.ghostPhrases).toBe(false);
  });

  it('fills in missing or bad values when loading', () => {
    const c = normalizeAssist({ level: 'wizard', customs: [{ name: 'Draft', settings: { smartTypeMax: 99, hints: 'loud' } }] });
    expect(c.level).toBe('intermediate');
    expect(c.customs[0].settings.smartTypeMax).toBe(12);
    expect(c.customs[0].settings.hints).toBe('builder');
    expect(normalizeAssist({ level: 'custom', customs: [] }).level).toBe('intermediate');
  });

  it('makes Custom setups from the current level and edits them', () => {
    let c: AssistConfig = { ...DEFAULT_ASSIST, level: 'beginner' };
    c = addCustom(c, 'Drafting', 'a');
    expect(c.level).toBe('custom');
    expect(effectiveSettings(c).formatCoach).toBe('all');
    c = updateCustom(c, 'a', { settings: { ...c.customs[0].settings, formatCoach: 'off' } });
    expect(effectiveSettings(c).formatCoach).toBe('off');
    c = addCustom(c, 'Polish', 'b');
    expect(c.customs.map((x) => x.name)).toEqual(['Drafting', 'Polish']);
    c = removeCustom(c, 'b');
    expect(c.activeCustom).toBe('a');
    c = removeCustom(c, 'a');
    expect(c.level).toBe('intermediate');
  });

  it('exports and imports setups, replacing ones with the same name', () => {
    const c = addCustom({ ...DEFAULT_ASSIST, level: 'professional' }, 'Polish', 'p');
    const file = exportCustoms(c);
    let n = 0;
    const into = importCustoms(addCustom(DEFAULT_ASSIST, 'polish', 'x'), file, () => `id${n++}`);
    expect(into.customs).toHaveLength(1);
    expect(into.customs[0].id).toBe('x');
    expect(into.customs[0].settings.ghostStructure).toBe(false);
    expect(() => importCustoms(DEFAULT_ASSIST, '{"kind":"other"}', () => 'z')).toThrow();
  });

  it('the Ghost switch turns ghost text off, or on in a level that has none', () => {
    const pro = { ...DEFAULT_ASSIST, level: 'professional' as const };
    expect(ghostOn(pro)).toBe(false);
    expect(ghostOn({ ...pro, ghost: true })).toBe(true);
    const mid = { ...DEFAULT_ASSIST, level: 'intermediate' as const };
    expect(ghostOn(mid)).toBe(true);
    const off = effectiveSettings({ ...mid, ghost: false });
    expect([off.ghostStructure, off.ghostPhrases, off.nextSpeaker]).toEqual([false, false, 'off']);
  });
});

describe('smarter SmartType', () => {
  const script = [
    b('scene_heading', 'INT. HOUSE - KITCHEN - NIGHT'),
    b('scene_heading', 'INT. HOUSE - BEDROOM - DAWN'),
    b('scene_heading', 'EXT. HOUSE - LATE AFTERNOON'),
    b('transition', 'WHIP PAN TO:'),
    b('character', 'MARA (WHISPERING)'),
    b('dialogue', 'Hi.'),
  ];

  it('reads sub-locations and times from headings', () => {
    expect(parseHeading('INT. HOUSE - KITCHEN - NIGHT')).toEqual({ prefix: 'INT. ', locations: ['HOUSE', 'KITCHEN'], time: 'NIGHT' });
    expect(parseHeading('EXT. FIELD')).toEqual({ prefix: 'EXT. ', locations: ['FIELD'], time: null });
  });

  it('offers rooms under a place, then times', () => {
    const s = suggest(script, 'INT. HOUSE - ', 'scene_heading');
    expect(s?.from).toBe(13);
    expect(texts(s).slice(0, 2).sort()).toEqual(['BEDROOM', 'KITCHEN']);
    expect(s?.items[0].suffix).toBe(' - ');
    expect(texts(s)).toContain('DAWN');
  });

  it('learns custom times and transitions', () => {
    expect(texts(suggest(script, 'INT. HOUSE - LA', 'scene_heading'))).toContain('LATE AFTERNOON');
    expect(texts(suggest(script, 'W', 'transition'))).toEqual(['WHIP PAN TO:']);
  });

  it('learns extensions used in the script', () => {
    expect(texts(suggest(script, 'MARA (WH', 'character'))).toEqual(['WHISPERING)']);
  });

  it('suggests tagged cast and locations before they are used', () => {
    const tags: TagItem[] = [{ id: 't1', category: 'cast', name: 'Jonah' }, { id: 't2', category: 'locations', name: 'Pier' }];
    expect(texts(suggest(script, 'JO', 'character', { tags }))).toEqual(['JONAH']);
    expect(texts(suggest(script, 'EXT. PI', 'scene_heading', { tags }))).toEqual(['PIER']);
  });

  it('guesses who speaks next: the person spoken to comes first', () => {
    const scene = [
      b('scene_heading', 'INT. LAB - DAY'), b('character', 'ANA'), b('dialogue', 'Ready?'),
      b('character', 'BEN'), b('dialogue', 'No.'), b('character', ''),
    ];
    expect(likelySpeakers(screenplay, scene, 5)[0]).toBe('ANA');
    const all = [...scene.slice(0, 5)];
    expect(texts(suggest(all, '', 'character', { nextSpeaker: 'dropdown' }))[0]).toBe('ANA');
    expect(suggest(all, '', 'character', { nextSpeaker: 'ghost' })).toBeNull();
  });

  it('suggests parentheticals, including who a line is to', () => {
    const scene = [b('scene_heading', 'INT. LAB - DAY'), b('character', 'ANA'), b('dialogue', 'Ready?'), b('character', 'BEN')];
    const s = suggest(scene, '(t', 'parenthetical');
    expect(s?.from).toBe(1);
    expect(texts(s)).toContain('to ANA');
    expect(texts(suggest(scene, '(', 'parenthetical', { eager: true })).length).toBeGreaterThan(3);
  });

  it('completes a capitalised name in action', () => {
    const s = suggest([b('character', 'MARGARET'), b('dialogue', 'Hi.')], 'Then MAR', 'action');
    expect(s).toMatchObject({ from: 5, items: [{ text: 'MARGARET' }] });
    expect(suggest([b('character', 'MARGARET')], 'Then mar', 'action')).toBeNull();
  });

  it('opens on an empty line only when eager', () => {
    expect(suggest(script, '', 'transition')).toBeNull();
    expect(texts(suggest(script, '', 'transition', { eager: true }))[0]).toBe('WHIP PAN TO:');
  });
});

describe('ghost text', () => {
  const s = getLevel('intermediate').settings;
  const run = (blocks: Block[], before: string, after = '') => predict({ dt: screenplay, blocks, index: blocks.length - 1, before, after, settings: s });

  it('predicts the next speaker on an empty Character line', () => {
    const blocks = [b('scene_heading', 'INT. LAB - DAY'), b('character', 'ANA'), b('dialogue', 'Hi.'), b('character', 'BEN'), b('dialogue', 'Hey.'), b('character', '')];
    expect(run(blocks, '')).toBe('ANA');
  });

  it("adds (CONT'D) when the same character speaks again after action", () => {
    const blocks = [b('scene_heading', 'INT. LAB - DAY'), b('character', 'ANA'), b('dialogue', 'Hi.'), b('action', 'She waits.'), b('character', 'ANA')];
    expect(run(blocks, 'ANA')).toBe(" (CONT'D)");
    const other = [...blocks.slice(0, 4), b('character', 'BEN')];
    expect(run(other, 'BEN')).toBeNull();
  });

  it('only shows at the end of an element', () => {
    const blocks = [b('character', 'ANA'), b('dialogue', 'Hi.'), b('character', '')];
    expect(run(blocks, '', 'X')).toBeNull();
  });

  it('suggests the usual transition, and cuts back to the place two scenes ago', () => {
    const blocks = [b('scene_heading', 'INT. LAB - DAY'), b('transition', 'CUT TO:'), b('scene_heading', 'EXT. ROOF - DAY'), b('transition', 'CUT TO:'), b('transition', '')];
    expect(run(blocks, '')).toBe('CUT TO:');
    const heads = [b('scene_heading', 'INT. LAB - DAY'), b('scene_heading', 'EXT. ROOF - DAY'), b('scene_heading', '')];
    expect(run(heads, '')).toBe('INT. LAB - ');
  });

  it("finishes a phrase a character has used before, in that character's voice", () => {
    const corpusLines = ['I told you, the tide waits for no one.', 'Remember: the tide waits for no one.', 'Fine.'];
    expect(phrase(corpusLines, 'Well, the tide ')).toBe('waits for no one.');
    expect(phrase(corpusLines, 'Well, the ti')).toBe('de waits for no one.');
    expect(phrase(['the cat sat', 'the dog ran'], 'the ')).toBeNull();
  });

  it('stays quiet in phrases when the level turns them off', () => {
    const blocks = [b('character', 'ANA'), b('dialogue', 'the tide waits'), b('character', 'ANA'), b('dialogue', 'the tide waits'), b('character', 'ANA'), b('dialogue', '')];
    const pro = getLevel('professional').settings;
    expect(predict({ dt: screenplay, blocks, index: 5, before: 'the tide ', after: '', settings: pro })).toBeNull();
    expect(predict({ dt: screenplay, blocks, index: 5, before: 'the tide ', after: '', settings: s })).toBe('waits');
  });
});

describe('format coach', () => {
  it('flags real mistakes as serious and style points as tips', () => {
    const blocks = [
      b('scene_heading', 'KITCHEN'),
      b('action', 'Mara walks in.'),
      b('character', 'MARA'),
      b('action', 'Nothing.'),
      b('dialogue', 'Orphan line.'),
      b('transition', 'CUT TO'),
      b('parenthetical', '(a very long parenthetical that wraps lines)'),
    ];
    const all = checkFormat(screenplay, blocks);
    const msg = (i: number) => all.filter((x) => x.index === i).map((x) => x.serious);
    expect(msg(0)).toEqual([true]);
    expect(msg(1)).toEqual([false]);
    expect(all.find((x) => x.index === 1)).toMatchObject({ from: 0, to: 4 });
    expect(msg(2)).toEqual([true]);
    expect(msg(4)).toEqual([true]);
    expect(msg(5)).toEqual([false]);
    expect(visibleIssues(all, 'serious').every((x) => x.serious)).toBe(true);
    expect(visibleIssues(all, 'off')).toEqual([]);
  });

  it('is quiet on a well-formatted scene', () => {
    const blocks = [b('scene_heading', 'INT. LAB - DAY'), b('action', 'MARA works.'), b('character', 'MARA'), b('dialogue', 'Done.'), b('transition', 'CUT TO:')];
    expect(checkFormat(screenplay, blocks)).toEqual([]);
  });

  it('flags long action paragraphs', () => {
    expect(checkFormat(screenplay, [b('action', 'word '.repeat(70))])[0].message).toMatch(/lines/);
  });
});

describe('scene builder structures', () => {
  const o = { heading: 'INT. LAB - DAY', characters: ['ANA', 'BEN'], lines: 4, second: 'EXT. ROOF - NIGHT', shots: 3, note: 'Goal: escape' };

  it('builds a basic scene with hints and the note on the heading', () => {
    const out = STRUCTURES.find((s) => s.id === 'basic')!.build(o);
    expect(out.map((x) => x.type)).toEqual(['scene_heading', 'action', 'character', 'dialogue', 'character', 'dialogue']);
    expect(out[0]).toMatchObject({ note: 'Goal: escape' });
    expect(out[1].hint).toBeTruthy();
    expect(blockText(out[4])).toBe('BEN');
  });

  it('alternates speakers in a dialogue exchange', () => {
    const out = STRUCTURES.find((s) => s.id === 'dialogue')!.build(o);
    expect(out.filter((x) => x.type === 'character').map(blockText)).toEqual(['ANA', 'BEN', 'ANA', 'BEN']);
  });

  it('builds intercuts, montages and flashbacks', () => {
    const ic = STRUCTURES.find((s) => s.id === 'intercut')!.build(o);
    expect(ic.map(blockText)).toContain('INTERCUT - LAB / ROOF');
    const m = STRUCTURES.find((s) => s.id === 'montage')!.build(o);
    expect(m.map(blockText)).toEqual(['MONTAGE - LAB', '', '', '', 'END MONTAGE']);
    const f = STRUCTURES.find((s) => s.id === 'flashback')!.build(o);
    expect(blockText(f[0])).toBe('INT. LAB - DAY (FLASHBACK)');
    expect(blockText(f[f.length - 1])).toBe('BACK TO PRESENT');
  });

  it('has stageplay shapes', () => {
    const st = structuresFor('stageplay');
    expect(st.map((x) => x.name)).toEqual(['Basic scene', 'Dialogue exchange']);
    expect(st[0].build({ ...o, heading: 'SCENE 2' })[0]).toMatchObject({ type: 'scene' });
  });

  it('saves a scene layout as a template with numbered speakers', () => {
    const scene = [b('scene_heading', 'INT. LAB - DAY'), b('action', 'x'), b('character', 'ANA'), b('dialogue', 'a'), b('character', 'BEN (V.O.)'), b('dialogue', 'b'), b('character', 'ANA'), b('dialogue', 'c'), b('transition', 'CUT TO:')];
    const steps = layoutOf(scene, (t) => t === 'character');
    expect(steps.filter((s) => s.speaker).map((s) => s.speaker)).toEqual([1, 2, 1]);
    expect(steps[steps.length - 1]).toEqual({ type: 'transition', text: 'CUT TO:' });
    const def = structuresFor('screenplay', [{ id: 's', name: 'Mine', docType: 'screenplay', steps }]).find((x) => x.name === 'Mine')!;
    const built = def.build({ ...o, characters: ['ZED', 'YUL'] });
    expect(built.filter((x) => x.type === 'character').map(blockText)).toEqual(['ZED', 'YUL', 'ZED']);
    expect(blockText(built[0])).toBe('INT. LAB - DAY');
  });
});

describe('slash commands', () => {
  it('only counts a slash on an otherwise empty line', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/sc')).toBe('sc');
    expect(slashQuery('and/or')).toBeNull();
    expect(slashQuery('/12')).toBeNull();
  });
  it('matches by the start of any word', () => {
    const cmds = slashCommands('screenplay');
    expect(matchSlash(cmds, 'sc').map((c) => c.id)).toEqual(['scene']);
    expect(matchSlash(cmds, 'ex').map((c) => c.id)).toEqual(['scene:dialogue']);
    expect(matchSlash(cmds, 'pla').map((c) => c.id)).toEqual(['names']);
    expect(slashCommands('stageplay').some((c) => c.id === 'scene:intercut')).toBe(false);
  });
});

describe('inserting a built scene', () => {
  it('replaces the empty line in one step and puts the cursor in the first placeholder', () => {
    const state = stateWith([b('action', 'Before.'), b('action', '')]);
    const out = STRUCTURES[0].build({ heading: 'INT. LAB - DAY', characters: ['ANA'], lines: 2, second: '', shots: 2, note: '' });
    const tr = replaceElementWith(state, 1, out)!;
    const next = state.apply(tr);
    const blocks = docToBlocks(next.doc);
    expect(blocks.map((x) => x.type)).toEqual(['action', 'scene_heading', 'action', 'character', 'dialogue']);
    expect(next.selection.$from.index(0)).toBe(2);
    // Typing clears the hint; Enter at the end of a filled line moves into the next placeholder.
    expect(blocks[2].hint).toBeTruthy();
  });

  it('Enter at the end of a line jumps into a waiting placeholder', () => {
    const blocks = [b('character', 'ANA'), { ...b('dialogue', ''), hint: 'What does ANA say?' }];
    const state = stateWith(blocks, 0);
    let next = state;
    enterCommand(screenplay)(state, (tr) => { next = state.apply(tr); });
    expect(docToBlocks(next.doc)).toHaveLength(2);
    expect(next.selection.$from.index(0)).toBe(1);
  });
});

describe('rename everywhere', () => {
  it('keeps the case of each mention', () => {
    expect(matchCase('MARA', 'nora')).toBe('NORA');
    expect(matchCase('Mara', 'NORA')).toBe('Nora');
  });

  it('renames cues and mentions of a character', () => {
    const state = stateWith([b('action', 'MARA enters. Mara smiles.'), b('character', 'Mara (V.O.)'), b('dialogue', 'Hi, Mara.'), b('character', 'MARAH')]);
    const next = state.apply(renameCharacter(state, screenplay, 'MARA', 'Nora'));
    expect(docToBlocks(next.doc).map(blockText)).toEqual(['NORA enters. Nora smiles.', 'Nora (V.O.)', 'Hi, Nora.', 'MARAH']);
  });

  it('renames a place only where it sits under the same parent', () => {
    const state = stateWith([
      b('scene_heading', 'INT. HOUSE - KITCHEN - NIGHT'), b('scene_heading', 'INT. DINER - KITCHEN - DAY'), b('scene_heading', 'EXT. HOUSE - DAY'),
    ]);
    const kitchen = state.apply(renameLocation(state, screenplay, ['HOUSE', 'KITCHEN'], 'pantry'));
    expect(docToBlocks(kitchen.doc).map(blockText)).toEqual(['INT. HOUSE - PANTRY - NIGHT', 'INT. DINER - KITCHEN - DAY', 'EXT. HOUSE - DAY']);
    const house = state.apply(renameLocation(state, screenplay, ['HOUSE'], 'Cottage'));
    expect(docToBlocks(house.doc).map(blockText)).toEqual(['INT. COTTAGE - KITCHEN - NIGHT', 'INT. DINER - KITCHEN - DAY', 'EXT. COTTAGE - DAY']);
  });
});

describe('element help', () => {
  it('every element has a hint and a one-line guide', () => {
    for (const dt of [screenplay, stageplay]) for (const e of dt.elements) { expect(e.hint).toBeTruthy(); expect(e.help).toBeTruthy(); }
  });
});
