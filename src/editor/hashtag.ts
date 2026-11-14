import { TagItem } from '../model';
import { normName } from '../tags/breakdown';
import { TagCategory, getCategory, visibleTypes } from '../tags/categories';

/**
 * Hashtag tagging while writing.
 *
 * - "#" opens the list of tag types. Picking one turns it into "#props:" and
 *   the dropdown then offers that type's elements, or a new one named after
 *   whatever is typed next ("#props:watch").
 * - "#watch" offers matching tag types, matching elements, and "watch" as a
 *   new element of each type.
 *
 * Accepting removes the "#…" and leaves the tagged words. Underscores join
 * words: "#red_hat" tags "red hat". Escape keeps the "#" as plain text.
 */

export interface HashtagQuery {
  /** Offset of the "#" inside the element. */
  from: number;
  /** A type id or name typed before ":", as in "#props:watch". */
  type: string | null;
  /** The element name being typed (may be empty). */
  typed: string;
}

const WORD = String.raw`[\p{L}\p{N}][\p{L}\p{N}'’_-]*`;
// A "#" at the start or after a space/punctuation (not "##" or "C#").
const HASH_RE = new RegExp(String.raw`(?:^|[^\p{L}\p{N}#&])#(?:([\p{L}\p{N}_-]+):)?(${WORD})?$`, 'u');

export function hashtagQuery(before: string): HashtagQuery | null {
  const m = HASH_RE.exec(before);
  if (!m) return null;
  const typed = m[2] ?? '';
  const type = m[1] ?? null;
  const len = 1 + (type !== null ? type.length + 1 : 0) + typed.length;
  return { from: before.length - len, type, typed };
}

/** "red_hat" -> "red hat". */
export const hashtagText = (typed: string) => typed.replace(/_+/g, ' ').trim();

export interface HashtagOption {
  /** Shown in the dropdown. */
  label: string;
  /** Second line. */
  desc: string;
  /** The tag type. */
  category: string;
  /** Picking this only chooses the type: the text becomes "#<type>:" and the menu stays open. */
  pickType?: boolean;
  /** Element name to tag with. */
  name: string;
  /** Text that replaces the "#…" in the script. */
  insert: string;
  /** Set when this tags an element that already exists. */
  itemId?: string;
  /** Not selectable: a line of help. */
  hint?: boolean;
}

/** Find a type by what was typed after "#": its id, or the start of its name. */
export function matchType(types: TagCategory[], typed: string): TagCategory | undefined {
  const t = typed.toLowerCase().replace(/_/g, ' ');
  return types.find((c) => c.id.toLowerCase() === typed.toLowerCase())
    ?? types.find((c) => c.name.toLowerCase() === t)
    ?? types.find((c) => c.name.toLowerCase().startsWith(t));
}

const typeOption = (c: TagCategory): HashtagOption => ({
  label: c.name, desc: c.hint || 'Tag type', category: c.id, pickType: true, name: '', insert: `#${c.id}:`,
});

function existingOptions(items: TagItem[], text: string, types: TagCategory[], max: number): HashtagOption[] {
  const t = normName(text);
  const starts = items.filter((i) => normName(i.name).startsWith(t));
  const contains = items.filter((i) => !starts.includes(i) && normName(i.name).includes(t));
  return [...starts, ...contains].slice(0, max).map((i) => {
    // Keep what was typed and complete the rest, so "#wat" -> "watch", not "Watch".
    const prefix = normName(i.name).startsWith(t) && i.name.length >= text.length;
    return {
      label: i.name, desc: getCategory(i.category, types).name, category: i.category, name: i.name, itemId: i.id,
      insert: prefix && text ? text + i.name.slice(text.length) : i.name,
    };
  });
}

const newOption = (c: TagCategory, text: string): HashtagOption => ({
  label: `“${text}” as ${c.name}`, desc: 'New element', category: c.id,
  name: c.id === 'cast' ? text.toUpperCase() : text, insert: text,
});

/**
 * Dropdown choices for a query. `types` is every tag type (hidden ones are
 * skipped); `preferred` is the type used last, listed first.
 */
export function hashtagOptions(q: HashtagQuery, items: TagItem[], types: TagCategory[], preferred: string, maxExisting = 5): HashtagOption[] {
  const shown = visibleTypes(types);
  const text = hashtagText(q.typed);

  // "#props:..." — one type chosen.
  if (q.type !== null) {
    const type = matchType(types, q.type);
    if (!type) return [];
    const mine = items.filter((i) => i.category === type.id);
    if (!text) {
      const list = existingOptions(mine, '', types, 8);
      return list.length ? list : [{ label: `Type a name for the ${type.name.toLowerCase()} element`, desc: 'Then press Enter', category: type.id, name: '', insert: '', hint: true }];
    }
    const existing = existingOptions(mine, text, types, maxExisting);
    const exact = existing.some((o) => normName(o.name) === normName(text));
    return exact ? existing : [...existing, newOption(type, text)];
  }

  // "#" alone — the list of tag types.
  if (!text) {
    const first = shown.find((c) => c.id === preferred);
    return (first ? [first, ...shown.filter((c) => c !== first)] : shown).map(typeOption);
  }

  // "#word" — types named like it, matching elements, then a new element of each type.
  const t = text.toLowerCase();
  const typeHits = shown.filter((c) => c.name.toLowerCase().startsWith(t) || c.id.startsWith(t)).map(typeOption);
  const existing = existingOptions(items, text, types, maxExisting);
  const exact = new Set(existing.filter((o) => normName(o.name) === normName(text)).map((o) => o.category));
  const first = shown.find((c) => c.id === preferred);
  const order = first ? [first, ...shown.filter((c) => c !== first)] : shown;
  const fresh = order.filter((c) => !exact.has(c.id)).map((c) => newOption(c, text));
  return [...typeHits, ...existing, ...fresh];
}
