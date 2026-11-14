/**
 * Tag types (breakdown categories), the same idea as Final Draft's tagging
 * categories and a StudioBinder breakdown sheet. Like document types and themes
 * they are data: the tag picker, # menu, breakdown panel and CSV export all
 * read this list. Writers can add their own types per script, and hide
 * built-in ones they don't use. Colors are named hues from
 * src/themes/tagColors.ts, so they follow the theme.
 */

export interface TagCategory {
  id: string;
  name: string;
  /** Shown in the picker to explain what belongs here. */
  hint: string;
  /** A hue name from TAG_HUES. */
  hue: string;
  /** Made by the writer (saved in the script) rather than built in. */
  custom?: boolean;
  /** Left out of the tag picker and # menu (already-tagged elements still show). */
  hidden?: boolean;
}

export const TAG_CATEGORIES: TagCategory[] = [
  { id: 'cast', name: 'Cast', hint: 'Characters with lines or a name', hue: 'red' },
  { id: 'extras', name: 'Extras', hint: 'Background people and crowds', hue: 'orange' },
  { id: 'props', name: 'Props', hint: 'Objects a character handles', hue: 'violet' },
  { id: 'wardrobe', name: 'Wardrobe', hint: 'Costumes and clothing', hue: 'magenta' },
  { id: 'makeup', name: 'Hair & Makeup', hint: 'Wounds, wigs, ageing, blood', hue: 'pink' },
  { id: 'locations', name: 'Locations', hint: 'Places, sets and rooms', hue: 'green' },
  { id: 'set', name: 'Set Dressing', hint: 'Furniture and things in the room', hue: 'olive' },
  { id: 'vehicles', name: 'Vehicles', hint: 'Cars, boats, planes', hue: 'blue' },
  { id: 'animals', name: 'Animals', hint: 'Animals on screen', hue: 'amber' },
  { id: 'effects', name: 'Effects', hint: 'Special and visual effects', hue: 'cyan' },
  { id: 'stunts', name: 'Stunts', hint: 'Fights, falls, dangerous action', hue: 'slate' },
  { id: 'sound', name: 'Sound & Music', hint: 'Sound effects, songs, score', hue: 'indigo' },
  { id: 'shots', name: 'Shots', hint: 'Camera shots and angles', hue: 'teal' },
];

export const CATEGORY_IDS = TAG_CATEGORIES.map((c) => c.id);

/** Look up a type; an unknown id (e.g. a deleted custom type) gets a grey placeholder. */
export function getCategory(id: string, types: TagCategory[] = TAG_CATEGORIES): TagCategory {
  return types.find((c) => c.id === id) ?? TAG_CATEGORIES.find((c) => c.id === id)
    ?? { id, name: 'Other', hint: '', hue: 'slate' };
}

/** Where a script keeps its own tag types. */
export interface TagTypeSource {
  tagTypes?: TagCategory[];
  hiddenTagTypes?: string[];
}

/** Built-in types followed by the script's custom ones, with `hidden` filled in. */
export function allTagTypes(src: TagTypeSource): TagCategory[] {
  const hidden = new Set(src.hiddenTagTypes ?? []);
  const custom = (src.tagTypes ?? []).map((c) => ({ ...c, custom: true }));
  return [...TAG_CATEGORIES, ...custom].map((c) => (hidden.has(c.id) ? { ...c, hidden: true } : c));
}

export const visibleTypes = (types: TagCategory[]) => types.filter((c) => !c.hidden);

/** CSS color for a type: `variant` is '' (page), '-soft', '-ui' or '-ui-soft'. */
export const tagColor = (c: TagCategory, variant = '') => `var(--tag-${c.hue}${variant})`;

/** "Practical Lights" -> "practical_lights", made unique among `taken`. Used after "#" as in "#practical_lights:". */
export function typeSlug(name: string, taken: string[]): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'type';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
}

const LAST_KEY = 'scriptflow:last-tag-category';

/** The category picked most recently, so the next tag starts there. */
export function lastCategory(): string {
  try { return localStorage.getItem(LAST_KEY) || 'props'; } catch { return 'props'; }
}

export function rememberCategory(id: string) {
  try { localStorage.setItem(LAST_KEY, id); } catch { /* storage blocked */ }
}
