import { useEffect, useMemo, useRef, useState } from 'react';
import { DocTypeDef, getElement } from '../doctypes';
import { Block, TagItem, blockText } from '../model';
import { characterNames, locationsUnder, parseHeading } from '../editor/smarttype';
import { speakerName } from '../tags/breakdown';

interface Props {
  dt: DocTypeDef;
  blocks: Block[];
  tags: TagItem[];
  /** Put the cursor in the "add a character" box. */
  focusAdd?: boolean;
  onRenameCharacter: (from: string, to: string) => void;
  onRenameLocation: (path: string[], to: string) => void;
  onAddCharacter: (name: string) => void;
  onAddLocation: (name: string) => void;
  onClose: () => void;
}

interface Place { path: string[]; name: string; scenes: number; depth: number }

function RenameRow({ label, meta, depth = 0, onRename }: { label: string; meta: string; depth?: number; onRename: (to: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  if (editing) {
    return (
      <li style={{ paddingLeft: depth * 16 }}>
        <form className="rename-form" onSubmit={(e) => { e.preventDefault(); if (value.trim()) onRename(value.trim()); setEditing(false); }}>
          <input autoFocus aria-label={`New name for ${label}`} value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="primary">Rename everywhere</button>
          <button type="button" onClick={() => { setValue(label); setEditing(false); }}>Cancel</button>
        </form>
      </li>
    );
  }
  return (
    <li style={{ paddingLeft: depth * 16 }}>
      <span className="name">{label}</span>
      <small>{meta}</small>
      <button type="button" className="link" onClick={() => setEditing(true)}>Rename</button>
    </li>
  );
}

export function NamesDialog({ dt, blocks, tags, focusAdd, onRenameCharacter, onRenameLocation, onAddCharacter, onAddLocation, onClose }: Props) {
  const [newChar, setNewChar] = useState('');
  const [newPlace, setNewPlace] = useState('');
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusAdd) addRef.current?.focus(); }, [focusAdd]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const characters = useMemo(() => {
    const counts = new Map<string, number>();
    blocks.forEach((b) => {
      if (getElement(dt, b.type).speaker) {
        const n = speakerName(blockText(b)).toUpperCase();
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    });
    return characterNames(dt, blocks, blocks.length, tags).map((n) => ({ name: n, speeches: counts.get(n) ?? 0 }));
  }, [dt, blocks, tags]);

  const places = useMemo(() => {
    const heads = blocks.filter((b) => getElement(dt, b.type).smartType === 'sceneHeading').map((b) => parseHeading(blockText(b)).locations);
    const count = (path: string[]) => heads.filter((l) => l.slice(0, path.length).join(' - ') === path.join(' - ')).length;
    const out: Place[] = [];
    const walk = (path: string[], depth: number) => {
      if (depth > 3) return;
      for (const name of locationsUnder(dt, blocks, -1, path, depth === 0 ? tags : [])) {
        const p = [...path, name];
        out.push({ path: p, name, scenes: count(p), depth });
        walk(p, depth + 1);
      }
    };
    walk([], 0);
    return out;
  }, [dt, blocks, tags]);

  const hasHeadings = dt.elements.some((e) => e.smartType === 'sceneHeading');
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal names" role="dialog" aria-label="Names and places" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Names &amp; places</h2>
        <p className="hint">Everything SmartType suggests. Rename one and it changes on every cue, heading and mention in one step (Undo puts it back). Names you add here are suggested before you've used them.</p>

        <section>
          <h3>Characters</h3>
          {!characters.length && <p className="hint">No characters yet.</p>}
          <ul className="names-list">
            {characters.map((c) => (
              <RenameRow key={c.name} label={c.name} meta={c.speeches ? plural(c.speeches, 'speech') : 'not used yet'}
                onRename={(to) => onRenameCharacter(c.name, to)} />
            ))}
          </ul>
          <form className="add-row" onSubmit={(e) => { e.preventDefault(); if (newChar.trim()) { onAddCharacter(newChar.trim()); setNewChar(''); } }}>
            <input ref={addRef} aria-label="New character name" placeholder="Add a character" value={newChar} onChange={(e) => setNewChar(e.target.value)} />
            <button type="submit" disabled={!newChar.trim()}>Add</button>
          </form>
        </section>

        {hasHeadings && (
          <section>
            <h3>Places</h3>
            {!places.length && <p className="hint">No scene headings yet.</p>}
            <ul className="names-list">
              {places.map((p) => (
                <RenameRow key={p.path.join('/')} label={p.name} depth={p.depth}
                  meta={p.scenes ? plural(p.scenes, 'scene') : 'not used yet'}
                  onRename={(to) => onRenameLocation(p.path, to)} />
              ))}
            </ul>
            <form className="add-row" onSubmit={(e) => { e.preventDefault(); if (newPlace.trim()) { onAddLocation(newPlace.trim()); setNewPlace(''); } }}>
              <input aria-label="New place" placeholder="Add a place" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} />
              <button type="submit" disabled={!newPlace.trim()}>Add</button>
            </form>
          </section>
        )}

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
