import { describe, expect, it } from 'vitest';
import { screenplay } from '../doctypes/screenplay';
import { characterAppearances } from '../characters/appearances';
import {
  dropCharacter, healProfiles, mergeCharacter, profileHasContent, profilesMarkdown, resolveScene, sceneWardrobe, upsertProfile,
} from '../characters/profiles';
import { Block, CharacterProfile, Script, TagItem, plainBlock as b } from '../model';
import { breakdownCsv, sceneRanges } from '../tags/breakdown';

const mara: TagItem = { id: 'm', category: 'cast', name: 'MARA' };
const max: TagItem = { id: 'x', category: 'cast', name: 'MAX' };

const blocks: Block[] = [
  b('scene_heading', 'INT. KITCHEN - DAY'),
  { type: 'action', runs: [{ text: 'MARA', tags: ['m'] }, { text: ' drops the watch. Max laughs.' }] },
  b('character', 'MARA (V.O.)'),
  b('parenthetical', '(quiet)'),
  b('dialogue', 'My watch! Mara, you fool.'),
  b('character', 'MAX'),
  b('dialogue', 'Relax, Mara. Mom will fix it.'),
  b('scene_heading', 'EXT. YARD - NIGHT'),
  b('action', 'Max buries the watch.'),
  { ...b('scene_heading', 'INT. KITCHEN - DAY'), tags: ['m'] },
];

describe('where a character appears', () => {
  it('finds speeches, tagged and untagged mentions, other people naming them and scene tags', () => {
    const a = characterAppearances(screenplay, blocks, mara);
    expect(a.scenes.map((s) => s.scene.num)).toEqual([1, 3]);
    const [one, three] = a.scenes;
    expect(one.entries.map((e) => e.kind)).toEqual(['action', 'speaks', 'named']);
    // Her own lines don't count as mentions of herself.
    expect(one.entries[1].snippet).toBe('My watch! Mara, you fool.');
    expect(one.entries[2]).toMatchObject({ by: 'MAX', index: 6, from: 7, to: 11 });
    expect(three.entries.map((e) => e.kind)).toEqual(['scene']);
    expect(a.speeches).toBe(1);
    expect(a.mentions).toBe(3);
  });

  it('counts aliases as mentions', () => {
    const a = characterAppearances(screenplay, blocks, mara, { itemId: 'm', aliases: ['Mom'] });
    expect(a.scenes[0].entries.filter((e) => e.kind === 'named')).toHaveLength(2);
  });

  it('finds untagged action mentions', () => {
    const a = characterAppearances(screenplay, blocks, max);
    expect(a.scenes.map((s) => [s.scene.num, s.entries.map((e) => e.kind)])).toEqual([[1, ['action', 'speaks']], [2, ['action']]]);
  });
});

describe('scene references', () => {
  const scenes = sceneRanges(screenplay, blocks);

  it('match by heading, nearest number first, then by number if the heading is being edited', () => {
    expect(resolveScene({ num: 3, heading: 'INT. KITCHEN - DAY' }, scenes)?.num).toBe(3);
    expect(resolveScene({ num: 1, heading: 'INT. KITCHEN - DAY' }, scenes)?.num).toBe(1);
    expect(resolveScene({ num: 2, heading: 'EXT. YARD - NIG' }, scenes)?.num).toBe(2);
    expect(resolveScene({ num: 2, heading: 'INT. SPACESHIP - LATER' }, scenes)).toBeUndefined();
  });

  it('follow a scene when one is inserted above it', () => {
    const profiles: CharacterProfile[] = [{ itemId: 'm', scenes: [{ scene: { num: 2, heading: 'EXT. YARD - NIGHT' }, wardrobe: 'Raincoat' }] }];
    const moved = sceneRanges(screenplay, [b('scene_heading', 'INT. HALL - DAY'), ...blocks]);
    const healed = healProfiles(profiles, moved);
    expect(healed[0].scenes![0].scene).toEqual({ num: 3, heading: 'EXT. YARD - NIGHT' });
    expect(healProfiles(healed, moved)).toBe(healed);
  });

  it('feed character wardrobe into the breakdown', () => {
    const script: Script = {
      docType: 'screenplay', titlePage: { title: 'T' } as never, blocks, tags: [mara, max],
      characters: [{ itemId: 'm', scenes: [{ scene: { num: 2, heading: 'EXT. YARD - NIGHT' }, wardrobe: 'Raincoat', note: 'Hiding' }] }],
    };
    expect(sceneWardrobe(script, scenes[1], scenes)).toEqual([{ item: mara, wardrobe: 'Raincoat' }]);
    const csv = breakdownCsv(screenplay, script, (s, all) => sceneWardrobe(script, s, all));
    expect(csv).toContain('2,EXT. YARD - NIGHT,Wardrobe,MARA: Raincoat,,From character profile');
  });
});

describe('profiles', () => {
  it('know when they hold something', () => {
    expect(profileHasContent({ itemId: 'm' })).toBe(false);
    expect(profileHasContent({ itemId: 'm', want: '  ', flaws: [] })).toBe(false);
    expect(profileHasContent({ itemId: 'm', scenes: [{ scene: { num: 1, heading: '' } }] })).toBe(false);
    expect(profileHasContent({ itemId: 'm', flaws: ['Proud'] })).toBe(true);
  });

  it('are created on first edit and follow merges and deletes', () => {
    let list = upsertProfile([], 'm', (p) => ({ ...p, want: 'Keep the light on' }));
    list = upsertProfile(list, 'x', (p) => ({ ...p, flaws: ['Lazy'], relationships: [{ id: 'r', to: 'm', kind: 'Brother' }] }));
    list = upsertProfile(list, 'dup', (p) => ({ ...p, want: 'ignored', need: 'Forgive', flaws: ['Proud'] }));
    const merged = mergeCharacter(list, 'dup', 'm');
    expect(merged.find((p) => p.itemId === 'm')).toMatchObject({ want: 'Keep the light on', need: 'Forgive', flaws: ['Proud'] });
    expect(merged.some((p) => p.itemId === 'dup')).toBe(false);
    const dropped = dropCharacter(merged, 'm');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].relationships).toEqual([]);
  });

  it('export as a Markdown character bible', () => {
    const script: Script = {
      docType: 'screenplay', titlePage: { title: 'The Watch' } as never, blocks, tags: [mara, max],
      characters: [
        { itemId: 'm', role: 'Protagonist', want: 'Fix the watch', flaws: ['Proud'], relationships: [{ id: 'r', to: 'x', kind: 'Sister' }],
          arcBeats: [{ id: 'a', text: 'Lets it go', scene: { num: 3, heading: 'INT. KITCHEN - DAY' } }],
          scenes: [{ scene: { num: 1, heading: 'INT. KITCHEN - DAY' }, wardrobe: 'Apron' }] },
        { itemId: 'x' },
      ],
    };
    const md = profilesMarkdown(script, sceneRanges(screenplay, blocks));
    expect(md).toContain('## MARA');
    expect(md).not.toContain('## MAX');
    expect(md).toContain('**Want:** Fix the watch');
    expect(md).toContain('- Proud');
    expect(md).toContain('- MAX: Sister');
    expect(md).toContain('- Lets it go (Scene 3, INT. KITCHEN - DAY)');
    expect(md).toContain('- Scene 1, INT. KITCHEN - DAY: Wardrobe: Apron');
  });
});
