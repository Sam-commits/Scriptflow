import { useMemo, useState } from 'react';
import { TagItem } from '../model';
import { findItem } from '../tags/breakdown';
import { TagCategory, getCategory, rememberCategory, tagColor, visibleTypes } from '../tags/categories';

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
  /** Every tag type; hidden ones aren't offered. */
  tagTypes: TagCategory[];
  /** Create a custom tag type and return its id. */
  onAddType: (name: string) => string;
  initialCategory: string;
  onTag: (r: TagRequest) => void;
  onClose: () => void;
}

export { lastCategory } from '../tags/categories';

/** Pick a category and element name for the selected text. */
export function TagDialog({ text, otherMentions, items, tagTypes, onAddType, initialCategory, onTag, onClose }: Props) {
  const shown = visibleTypes(tagTypes);
  const [category, setCategory] = useState(shown.some((c) => c.id === initialCategory) ? initialCategory : shown[0]?.id ?? 'props');
  const [newType, setNewType] = useState<string | null>(null);
  const type = getCategory(category, tagTypes);
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
    rememberCategory(id);
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
            const c = shown[Number(e.code.slice(5)) - 1];
            if (c) { e.preventDefault(); pick(c.id); }
          }
        }}
      >
        <h2>Tag “{clean.length > 60 ? clean.slice(0, 60) + '…' : clean}”</h2>
        <fieldset className="tag-cats">
          <legend className="sr-only">Category</legend>
          {shown.map((c, i) => (
            <button
              key={c.id} type="button" className={`tag-cat${c.id === category ? ' on' : ''}`}
              aria-pressed={c.id === category} title={`${c.hint}${i < 9 ? ` (Alt+${i + 1})` : ''}`}
              onClick={() => pick(c.id)}
            >
              <span className="dot" style={{ background: tagColor(c, '-ui') }} />{c.name}
            </button>
          ))}
          {newType === null ? (
            <button type="button" className="tag-cat add" onClick={() => setNewType('')} title="Make your own tag type">+ New type</button>
          ) : (
            <span className="tag-cat-new">
              <input
                autoFocus aria-label="New tag type name" placeholder="Type name" value={newType}
                onChange={(e) => setNewType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newType.trim()) { pick(onAddType(newType)); setNewType(null); }
                  }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNewType(null); }
                }}
              />
              <button type="button" disabled={!newType.trim()} onClick={() => { pick(onAddType(newType)); setNewType(null); }}>Add</button>
            </span>
          )}
        </fieldset>
        {type.hint && <p className="hint">{type.hint}</p>}
        <label>
          <span>Element name</span>
          <input autoFocus list="tag-names" value={name} onChange={(e) => setName(e.target.value)} />
          <datalist id="tag-names">{inCategory.map((i) => <option key={i.id} value={i.name} />)}</datalist>
        </label>
        <p className="hint">
          {existing ? `Adds to the existing ${type.name.toLowerCase()} element “${existing.name}”.`
            : `Creates a new ${type.name.toLowerCase()} element.`}
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
