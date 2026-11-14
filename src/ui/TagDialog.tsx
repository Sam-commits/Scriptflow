import { useMemo, useState } from 'react';
import { TagItem } from '../model';
import { findItem } from '../tags/breakdown';
import { TAG_CATEGORIES, getCategory } from '../tags/categories';

export interface TagRequest {
  category: string;
  name: string;
  notes: string;
  /** Also tag the other mentions of the selected text. */
  everywhere: boolean;
}

interface Props {
  /** The text being tagged. */
  text: string;
  /** How many other untagged-or-tagged mentions of the text exist outside the selection. */
  otherMentions: number;
  items: TagItem[];
  initialCategory: string;
  onTag: (r: TagRequest) => void;
  onClose: () => void;
}

const LAST_KEY = 'scriptflow:last-tag-category';
export const lastCategory = () => {
  try { return localStorage.getItem(LAST_KEY) || 'props'; } catch { return 'props'; }
};

/** Pick a category and element name for the selected text. */
export function TagDialog({ text, otherMentions, items, initialCategory, onTag, onClose }: Props) {
  const [category, setCategory] = useState(initialCategory);
  const clean = text.replace(/\s+/g, ' ').trim();
  const [name, setName] = useState(clean);
  const [notes, setNotes] = useState('');
  const [everywhere, setEverywhere] = useState(false);
  const existing = findItem(items, category, name);
  const inCategory = useMemo(
    () => items.filter((i) => i.category === category).sort((a, b) => a.name.localeCompare(b.name)),
    [items, category],
  );

  const pick = (id: string) => {
    setCategory(id);
    try { localStorage.setItem(LAST_KEY, id); } catch { /* ignore */ }
  };

  const submit = () => {
    if (!name.trim()) return;
    onTag({ category, name: category === 'cast' ? name.trim().toUpperCase() : name.trim(), notes: notes.trim(), everywhere });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal tag-dialog" onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          // Alt+1..9 picks a category without leaving the name field.
          if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
            const c = TAG_CATEGORIES[Number(e.code.slice(5)) - 1];
            if (c) { e.preventDefault(); pick(c.id); }
          }
        }}
      >
        <h2>Tag “{clean.length > 60 ? clean.slice(0, 60) + '…' : clean}”</h2>
        <fieldset className="tag-cats">
          <legend className="sr-only">Category</legend>
          {TAG_CATEGORIES.map((c, i) => (
            <button
              key={c.id} type="button" className={`tag-cat${c.id === category ? ' on' : ''}`}
              aria-pressed={c.id === category} title={`${c.hint}${i < 9 ? ` (Alt+${i + 1})` : ''}`}
              onClick={() => pick(c.id)}
            >
              <span className="dot" style={{ background: `var(--tag-${c.id}-ui)` }} />{c.name}
            </button>
          ))}
        </fieldset>
        <p className="hint">{getCategory(category).hint}</p>
        <label>
          <span>Element name</span>
          <input autoFocus list="tag-names" value={name} onChange={(e) => setName(e.target.value)} />
          <datalist id="tag-names">{inCategory.map((i) => <option key={i.id} value={i.name} />)}</datalist>
        </label>
        <p className="hint">
          {existing ? `Adds to the existing ${getCategory(category).name.toLowerCase()} element “${existing.name}”.`
            : `Creates a new ${getCategory(category).name.toLowerCase()} element.`}
        </p>
        {!existing && (
          <label>
            <span>Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. hero prop, needs a double" />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={everywhere} disabled={!otherMentions} onChange={(e) => setEverywhere(e.target.checked)} />
          Also tag {otherMentions ? `the ${otherMentions} other mention${otherMentions === 1 ? '' : 's'}` : 'other mentions (none found)'} outside dialogue
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!name.trim()}>Tag</button>
        </div>
      </form>
    </div>
  );
}
