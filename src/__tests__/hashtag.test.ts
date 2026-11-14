import { describe, expect, it } from 'vitest';
import { hashtagOptions, hashtagQuery, hashtagText, matchType } from '../editor/hashtag';
import { TAG_CATEGORIES, allTagTypes, getCategory, typeSlug, visibleTypes } from '../tags/categories';
import { breakdownCsv, sceneBreakdown, sceneRanges } from '../tags/breakdown';
import { screenplay } from '../doctypes/screenplay';
import { plainBlock as b } from '../model';

const items = [
  { id: 'w', category: 'props', name: 'Watch' },
  { id: 'm', category: 'cast', name: 'MARA' },
  { id: 's', category: 'wardrobe', name: 'Stopwatch strap' },
  { id: 'g', category: 'weapons', name: 'Flare gun' },
];
const custom = { id: 'weapons', name: 'Weapons', hint: 'Anything that fires', hue: 'brown' };
const types = allTagTypes({ tagTypes: [custom], hiddenTagTypes: ['animals'] });
const q = (s: string) => hashtagQuery(s)!;

describe('hashtag query', () => {
  it('finds #, #word and #type:word ending at the cursor', () => {
    expect(hashtagQuery('She drops the #wat')).toEqual({ from: 14, type: null, typed: 'wat' });
    expect(hashtagQuery('Room #')).toEqual({ from: 5, type: null, typed: '' });
    expect(hashtagQuery('A #props:')).toEqual({ from: 2, type: 'props', typed: '' });
    expect(hashtagQuery('A #props:red_ha')).toEqual({ from: 2, type: 'props', typed: 'red_ha' });
    expect(hashtagQuery('(#mara')).toEqual({ from: 1, type: null, typed: 'mara' });
  });
  it('ignores ##, # inside words, and a finished hashtag', () => {
    expect(hashtagQuery('##')).toBeNull();
    expect(hashtagQuery('C#minor')).toBeNull();
    expect(hashtagQuery('#watch ')).toBeNull();
  });
  it('turns underscores into spaces', () => {
    expect(hashtagText('red__hat')).toBe('red hat');
  });
});

describe('hashtag options', () => {
  it('lists the tag types for a lone #, last used first, without hidden ones', () => {
    const o = hashtagOptions(q('#'), items, types, 'weapons');
    expect(o[0]).toMatchObject({ pickType: true, category: 'weapons', insert: '#weapons:' });
    expect(o.map((x) => x.category)).not.toContain('animals');
    expect(o).toHaveLength(TAG_CATEGORIES.length); // 13 built-in - 1 hidden + 1 custom
  });

  it('after #type: offers that type’s elements, then a new one', () => {
    expect(hashtagOptions(q('#weapons:'), items, types, 'props').map((x) => x.itemId)).toEqual(['g']);
    const o = hashtagOptions(q('#props:wa'), items, types, 'cast');
    expect(o.map((x) => [x.itemId, x.insert, x.category])).toEqual([['w', 'watch', 'props'], [undefined, 'wa', 'props']]);
    expect(hashtagOptions(q('#props:watch'), items, types, 'cast').map((x) => x.itemId)).toEqual(['w']);
    expect(hashtagOptions(q('#vehicles:'), items, types, 'cast')[0].hint).toBe(true);
    expect(hashtagOptions(q('#nope:x'), items, types, 'cast')).toEqual([]);
  });

  it('after #word lists matching types, elements, then new elements', () => {
    const o = hashtagOptions(q('#wea'), items, types, 'props');
    expect(o[0]).toMatchObject({ pickType: true, category: 'weapons' });
    const w = hashtagOptions(q('#wat'), items, types, 'props');
    expect(w.slice(0, 2).map((x) => [x.itemId, x.insert])).toEqual([['w', 'watch'], ['s', 'Stopwatch strap']]);
    expect(w[2]).toMatchObject({ category: 'props', name: 'wat', insert: 'wat' });
  });

  it('skips a duplicate new element and uppercases cast names', () => {
    const fresh = hashtagOptions(q('#watch'), items, types, 'cast').filter((x) => !x.itemId && !x.pickType);
    expect(fresh[0]).toMatchObject({ category: 'cast', name: 'WATCH' });
    expect(fresh.some((x) => x.category === 'props')).toBe(false);
  });

  it('matches types by id or name start', () => {
    expect(matchType(types, 'Hair')?.id).toBe('makeup');
    expect(matchType(types, 'set')?.id).toBe('set');
  });
});

describe('custom tag types', () => {
  it('come after the built-ins and can hide built-ins', () => {
    expect(types.at(-1)).toMatchObject({ id: 'weapons', custom: true });
    expect(visibleTypes(types).some((t) => t.id === 'animals')).toBe(false);
    expect(getCategory('gone', types)).toMatchObject({ name: 'Other', hue: 'slate' });
  });

  it('get short, unique ids from their names', () => {
    expect(typeSlug('Practical Lights!', [])).toBe('practical_lights');
    expect(typeSlug('Café', [])).toBe('cafe');
    expect(typeSlug('Props', ['props'])).toBe('props_2');
  });

  it('show up in breakdowns and the CSV', () => {
    const blocks = [b('scene_heading', 'INT. BOAT - NIGHT'), { type: 'action', runs: [{ text: 'A flare gun.', tags: ['g'] }] }];
    const bd = sceneBreakdown(sceneRanges(screenplay, blocks)[0], blocks, items, types);
    expect(bd.groups.map((g) => g.category)).toEqual(['weapons']);
    const csv = breakdownCsv(screenplay, { docType: 'screenplay', titlePage: {} as never, blocks, tags: items, tagTypes: [custom] });
    expect(csv).toContain('Weapons,Flare gun');
  });
});
