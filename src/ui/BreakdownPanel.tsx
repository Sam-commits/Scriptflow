import { useMemo, useState } from 'react';
import { DocTypeDef } from '../doctypes';
import { Block, TagItem } from '../model';
import { countTags, findItem, sceneAt, sceneBreakdown, sceneRanges, scenesByItem, typesInUse } from '../tags/breakdown';
import { TagCategory, getCategory, tagColor, visibleTypes } from '../tags/categories';
import { HUE_IDS, TAG_HUES } from '../themes';

interface Props {
  dt: DocTypeDef;
  blocks: Block[];
  items: TagItem[];
  /** Every tag type, built-in and custom. */
  tagTypes: TagCategory[];
  onAddType: (name: string, hue?: string) => string;
  onUpdateType: (id: string, patch: Partial<TagCategory>) => void;
  onHideType: (id: string, hidden: boolean) => void;
  onDeleteType: (id: string) => void;
  /** Element index the cursor is in, and the tags under the cursor. */
  cursorIndex: number;
  cursorTags: string[];
  showTags: boolean;
  focusId: string | null;
  onShowTags: (on: boolean) => void;
  /** Select the next use of an item in the script. */
  onFind: (id: string, withinScene?: [number, number]) => void;
  onRemoveHere: (id: string) => void;
  onSceneTag: (sceneStart: number, category: string, name: string) => void;
  onRemoveSceneTag: (sceneStart: number, id: string) => void;
  onUpdateItem: (id: string, patch: Partial<TagItem>) => void;
  onDeleteItem: (id: string) => void;
  onAutoCast: () => void;
  onExportCsv: () => void;
  onClose: () => void;
}

const Dot = ({ type }: { type: TagCategory }) => <span className="dot" style={{ background: tagColor(type, '-ui') }} />;

export function BreakdownPanel(p: Props) {
  const [tab, setTab] = useState<'scene' | 'all' | 'types'>('scene');
  const typeOf = (id: string) => getCategory(id, p.tagTypes);
  const ranges = useMemo(() => sceneRanges(p.dt, p.blocks), [p.dt, p.blocks]);
  const scene = sceneAt(ranges, p.cursorIndex) ?? ranges[0];
  const byId = useMemo(() => new Map(p.items.map((i) => [i.id, i])), [p.items]);
  const here = p.cursorTags.map((id) => byId.get(id)).filter((i): i is TagItem => !!i);

  return (
    <aside className="breakdown" aria-label="Breakdown">
      <div className="bd-head">
        <h2>Breakdown</h2>
        <label className="check small"><input type="checkbox" checked={p.showTags} onChange={(e) => p.onShowTags(e.target.checked)} /> Highlight</label>
        <button className="icon-btn" aria-label="Close breakdown" onClick={p.onClose}>×</button>
      </div>
      <div className="segmented bd-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'scene'} className={tab === 'scene' ? 'on' : ''} onClick={() => setTab('scene')}>This scene</button>
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All elements</button>
        <button role="tab" aria-selected={tab === 'types'} className={tab === 'types' ? 'on' : ''} onClick={() => setTab('types')}>Tag types</button>
      </div>

      {here.length > 0 && (
        <section className="bd-here">
          <h3>At the cursor</h3>
          <ul className="chips">
            {here.map((i) => (
              <li key={i.id} className="chip">
                <Dot type={typeOf(i.category)} /><span>{i.name}</span><small>{typeOf(i.category).name}</small>
                <button aria-label={`Untag ${i.name} here`} title="Untag here" onClick={() => p.onRemoveHere(i.id)}>×</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'scene' && <SceneTab {...p} scene={scene} />}
      {tab === 'all' && <AllTab {...p} />}
      {tab === 'types' && <TypesTab {...p} />}
      {tab !== 'types' && <p className="hint bd-tip">Tip: type <b>#</b> while writing to tag as you go.</p>}
    </aside>
  );
}

function SceneTab(p: Props & { scene: ReturnType<typeof sceneAt> }) {
  const { scene } = p;
  const [category, setCategory] = useState('props');
  const [name, setName] = useState('');
  if (!scene) return <p className="hint">Write a scene heading to start a breakdown.</p>;
  const bd = sceneBreakdown(scene, p.blocks, p.items, p.tagTypes);
  const shown = visibleTypes(p.tagTypes);
  const canSceneTag = scene.num > 0;
  const add = () => { if (name.trim()) { p.onSceneTag(scene.start, category, name.trim()); setName(''); } };

  return (
    <div className="bd-scene">
      <p className="bd-scene-title">{scene.num > 0 && <span className="num">{scene.num}</span>}{scene.heading}</p>
      {bd.groups.length === 0 && (
        <p className="hint">Nothing tagged in this scene yet. Select text in the script and press Tag (Ctrl/⌘+Shift+E).</p>
      )}
      {bd.groups.map((g) => (
        <section key={g.category} className="bd-group">
          <h3><Dot type={getCategory(g.category, p.tagTypes)} />{getCategory(g.category, p.tagTypes).name}</h3>
          <ul>
            {g.items.map(({ item, count, sceneLevel }) => (
              <li key={item.id} className={p.focusId === item.id ? 'focus' : ''}>
                <button className="bd-item" onClick={() => p.onFind(item.id, [scene.start, scene.end])} title="Show in script">
                  <span>{item.name}</span>{count > 1 && <small>×{count}</small>}
                </button>
                {sceneLevel && (
                  <button className="bd-x" title="Remove from scene (not in the text)" aria-label={`Remove ${item.name} from scene`}
                    onClick={() => p.onRemoveSceneTag(scene.start, item.id)}>×</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {canSceneTag && (
        <form className="bd-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <h3>Add to this scene</h3>
          <p className="hint">For things the scene needs that the script never mentions.</p>
          <div className="bd-add-row">
            <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {shown.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input aria-label="Element name" list="bd-names" value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} />
            <datalist id="bd-names">{p.items.filter((i) => i.category === category).map((i) => <option key={i.id} value={i.name} />)}</datalist>
            <button type="submit" disabled={!name.trim()}>Add</button>
          </div>
        </form>
      )}
    </div>
  );
}

function AllTab(p: Props) {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const counts = useMemo(() => countTags(p.blocks), [p.blocks]);
  const scenes = useMemo(() => scenesByItem(p.dt, p.blocks), [p.dt, p.blocks]);
  const f = filter.trim().toLowerCase();
  const groups = typesInUse(p.tagTypes, p.items).map((c) => ({
    c, items: p.items.filter((i) => i.category === c.id && (!f || i.name.toLowerCase().includes(f)))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length);
  const hasSpeakers = p.dt.elements.some((e) => e.speaker);

  return (
    <div className="bd-all">
      <div className="bd-tools">
        {hasSpeakers && <button onClick={p.onAutoCast} title="Tag every character cue and name in action as Cast">Tag all characters</button>}
        <button onClick={p.onExportCsv} disabled={!p.items.length} title="Breakdown sheet for Excel, Numbers or Google Sheets">Export CSV</button>
      </div>
      {p.items.length > 0 && (
        <input className="bd-filter" type="search" placeholder="Filter elements" aria-label="Filter elements" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {p.items.length === 0 && <p className="hint">No elements yet. Select text in the script and press Tag, or tag all characters at once.</p>}
      {groups.map(({ c, items }) => (
        <section key={c.id} className="bd-group">
          <h3><Dot type={c} />{c.name}<small>{items.length}</small></h3>
          <ul>
            {items.map((i) => editing === i.id
              ? <ItemEditor key={i.id} item={i} items={p.items} types={p.tagTypes} onSave={(patch) => { p.onUpdateItem(i.id, patch); setEditing(null); }}
                  onDelete={() => { p.onDeleteItem(i.id); setEditing(null); }} onCancel={() => setEditing(null)} />
              : (
                <li key={i.id} className={p.focusId === i.id ? 'focus' : ''}>
                  <button className="bd-item" onClick={() => p.onFind(i.id)} title={i.notes || 'Show next use in script'} disabled={!counts.get(i.id)}>
                    <span>{i.name}</span>
                    <small>{counts.get(i.id) ? `sc. ${(scenes.get(i.id) ?? []).map((n) => n || '–').join(', ')}` : 'unused'}</small>
                  </button>
                  <button className="bd-x" aria-label={`Edit ${i.name}`} title="Rename, recategorize or delete" onClick={() => setEditing(i.id)}>✎</button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemEditor({ item, items, types, onSave, onDelete, onCancel }: {
  item: TagItem; items: TagItem[]; types: TagCategory[]; onSave: (p: Partial<TagItem>) => void; onDelete: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [notes, setNotes] = useState(item.notes ?? '');
  const clash = findItem(items.filter((i) => i.id !== item.id), category, name);
  return (
    <li className="bd-edit">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), category, notes: notes.trim() || undefined }); }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <input aria-label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {types.filter((c) => !c.hidden || c.id === item.category).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input aria-label="Notes" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {clash && <p className="hint">Saving merges this into “{clash.name}”.</p>}
        <div className="bd-edit-actions">
          <button type="button" className="danger" onClick={onDelete} title="Removes every tag for this element">Delete</button>
          <span className="spacer" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={!name.trim()}>{clash ? 'Merge' : 'Save'}</button>
        </div>
      </form>
    </li>
  );
}

/** Create, rename, recolor, hide and delete tag types. */
function TypesTab(p: Props) {
  const [name, setName] = useState('');
  const [hue, setHue] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of p.items) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [p.items]);
  const builtIn = p.tagTypes.filter((t) => !t.custom);
  const custom = p.tagTypes.filter((t) => t.custom);
  const add = () => { if (name.trim()) { p.onAddType(name.trim(), hue ?? undefined); setName(''); setHue(null); } };
  const count = (t: TagCategory) => counts.get(t.id) ?? 0;

  return (
    <div className="bd-types">
      <form className="bd-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <h3>New tag type</h3>
        <div className="bd-add-row two">
          <input aria-label="Tag type name" placeholder="e.g. Practical lights, Weapons" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!name.trim()}>Add</button>
        </div>
        <HuePicker value={hue} onChange={setHue} />
      </form>

      <section className="bd-group">
        <h3>Your types<small>{custom.length}</small></h3>
        {custom.length === 0 && <p className="hint">None yet. Custom types work everywhere built-in ones do, including the # menu.</p>}
        <ul>
          {custom.map((t) => editing === t.id ? (
            <TypeEditor key={t.id} type={t} uses={count(t)}
              onSave={(patch) => { p.onUpdateType(t.id, patch); setEditing(null); }}
              onDelete={() => { p.onDeleteType(t.id); setEditing(null); }}
              onCancel={() => setEditing(null)} />
          ) : (
            <li key={t.id} className={t.hidden ? 'muted' : ''}>
              <span className="bd-type"><Dot type={t} /><span>{t.name}</span><small>#{t.id} · {count(t)}</small></span>
              <label className="bd-show" title="Offer this type in the tag picker and # menu">
                <input type="checkbox" checked={!t.hidden} onChange={(e) => p.onHideType(t.id, !e.target.checked)} /> Show
              </label>
              <button className="bd-x" aria-label={`Edit ${t.name}`} title="Rename, recolor or delete" onClick={() => setEditing(t.id)}>✎</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bd-group">
        <h3>Built-in types<small>{builtIn.filter((t) => !t.hidden).length} shown</small></h3>
        <ul>
          {builtIn.map((t) => (
            <li key={t.id} className={t.hidden ? 'muted' : ''}>
              <span className="bd-type"><Dot type={t} /><span>{t.name}</span><small>#{t.id} · {count(t)}</small></span>
              <label className="bd-show" title="Offer this type in the tag picker and # menu">
                <input type="checkbox" checked={!t.hidden} onChange={(e) => p.onHideType(t.id, !e.target.checked)} /> Show
              </label>
            </li>
          ))}
        </ul>
        <p className="hint">Hiding a type only removes it from the pickers. Anything already tagged stays.</p>
      </section>
    </div>
  );
}

function HuePicker({ value, onChange }: { value: string | null; onChange: (h: string) => void }) {
  return (
    <div className="hue-row" role="radiogroup" aria-label="Color">
      {HUE_IDS.map((h) => (
        <button key={h} type="button" role="radio" aria-checked={value === h} aria-label={TAG_HUES[h].name} title={TAG_HUES[h].name}
          className={`hue-chip${value === h ? ' on' : ''}`} style={{ background: `var(--tag-${h}-ui)` }} onClick={() => onChange(h)} />
      ))}
    </div>
  );
}

function TypeEditor({ type, uses, onSave, onDelete, onCancel }: {
  type: TagCategory; uses: number; onSave: (p: Partial<TagCategory>) => void; onDelete: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(type.name);
  const [hint, setHint] = useState(type.hint);
  const [hue, setHue] = useState(type.hue);
  return (
    <li className="bd-edit">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), hint: hint.trim(), hue }); }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <input aria-label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Description" placeholder="What belongs here (optional)" value={hint} onChange={(e) => setHint(e.target.value)} />
        <HuePicker value={hue} onChange={setHue} />
        <p className="hint">Typed as <b>#{type.id}:</b> after “#”. Renaming keeps that shortcut.</p>
        <div className="bd-edit-actions">
          <button type="button" className="danger" onClick={onDelete}
            title={uses ? `Also deletes its ${uses} element${uses === 1 ? '' : 's'} and their tags` : 'Delete this type'}>Delete</button>
          <span className="spacer" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={!name.trim()}>Save</button>
        </div>
      </form>
    </li>
  );
}
