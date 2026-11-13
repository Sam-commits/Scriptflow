/**
 * Breakdown categories, the same idea as Final Draft's tagging categories and
 * a StudioBinder breakdown sheet. Like document types and themes they are data:
 * the tag picker, breakdown panel, CSV export and theme colors all read this list.
 * Colors live in src/themes/tagColors.ts so they follow the theme.
 */

export interface TagCategory {
  id: string;
  name: string;
  /** Shown in the picker to explain what belongs here. */
  hint: string;
}

export const TAG_CATEGORIES: TagCategory[] = [
  { id: 'cast', name: 'Cast', hint: 'Characters with lines or a name' },
  { id: 'extras', name: 'Extras', hint: 'Background people and crowds' },
  { id: 'props', name: 'Props', hint: 'Objects a character handles' },
  { id: 'wardrobe', name: 'Wardrobe', hint: 'Costumes and clothing' },
  { id: 'makeup', name: 'Hair & Makeup', hint: 'Wounds, wigs, ageing, blood' },
  { id: 'locations', name: 'Locations', hint: 'Places, sets and rooms' },
  { id: 'set', name: 'Set Dressing', hint: 'Furniture and things in the room' },
  { id: 'vehicles', name: 'Vehicles', hint: 'Cars, boats, planes' },
  { id: 'animals', name: 'Animals', hint: 'Animals on screen' },
  { id: 'effects', name: 'Effects', hint: 'Special and visual effects' },
  { id: 'stunts', name: 'Stunts', hint: 'Fights, falls, dangerous action' },
  { id: 'sound', name: 'Sound & Music', hint: 'Sound effects, songs, score' },
  { id: 'shots', name: 'Shots', hint: 'Camera shots and angles' },
];

export const CATEGORY_IDS = TAG_CATEGORIES.map((c) => c.id);

export function getCategory(id: string): TagCategory {
  return TAG_CATEGORIES.find((c) => c.id === id) ?? TAG_CATEGORIES[2];
}
