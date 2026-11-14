import { useMemo, useState } from 'react';
import { DocTypeDef } from '../doctypes';
import { Block, TagItem } from '../model';
import { SceneRange, countTags, findItem, sceneAt, sceneBreakdown, sceneRanges, scenesByItem } from '../tags/breakdown';
import { TAG_CATEGORIES, getCategory } from '../tags/categories';

interface Props {
  dt: DocTypeDef;
  blocks: Block[];
  items: TagItem[];
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
  /** Open a Cast item's character profile. */
  onOpenProfile?: (id: string) => void;
  /** Each character's wardrobe for a scene, from their profile. */
  wardrobe?: (scene: SceneRange) => { item: TagItem; wardrobe: string }[];
  onClose: () => void;
}

const Dot = ({ category }: { category: string }) => <span className="dot" style={{ background: `var(--tag-${category}-ui)` }} />;

export function BreakdownPanel(p: Props) {
  const [tab, setTab] = useState<'scene' | 'all'>('scene');
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
      </div>

      {here.length > 0 && (
        <section className="bd-here">
          <h3>At the cursor</h3>
          <ul className="chips">
            {here.map((i) => (
              <li key={i.id} className="chip">
                <Dot category={i.category} /><span>{i.name}</span><small>{getCategory(i.category).name}</small>
                <button aria-label={`Untag ${i.name} here`} title="Untag here" onClick={() => p.onRemoveHere(i.id)}>×</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'scene'
        ? <SceneTab {...p} scene={scene} />
        : <AllTab {...p} />}
    </aside>
  );
}

function SceneTab(p: Props & { scene: ReturnType<typeof sceneAt> }) {
  const { scene } = p;
  const [category, setCategory] = useState('props');
  const [name, setName] = useState('');
  if (!scene) return <p className="hint">Write a scene heading to start a breakdown.</p>;
  const bd = sceneBreakdown(scene, p.blocks, p.items);
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
          <h3><Dot category={g.category} />{getCategory(g.category).name}</h3>
          <ul>
            {g.items.map(({ item, count, sceneLevel }) => (
              <li key={item.id} className={p.focusId === item.id ? 'focus' : ''}>
                <button className="bd-item" onClick={() => p.onFind(item.id, [scene.start, scene.end])} title="Show in script">
                  <span>{item.name}</span>{count > 1 && <small>×{count}</small>}
                </button>
                {item.category === 'cast' && p.onOpenProfile && (
                  <button className="bd-x" title="Character profile" aria-label={`${item.name}'s profile`} onClick={() => p.onOpenProfile!(item.id)}>ⓘ</button>
                )}
                {sceneLevel && (
                  <button className="bd-x" title="Remove from scene (not in the text)" aria-label={`Remove ${item.name} from scene`}
                    onClick={() => p.onRemoveSceneTag(scene.start, item.id)}>×</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {(() => {
        const w = p.wardrobe?.(scene) ?? [];
        return w.length > 0 && (
          <section className="bd-group">
            <h3><Dot category="wardrobe" />Character wardrobe</h3>
            <ul>
              {w.map(({ item, wardrobe }) => (
                <li key={item.id}>
                  <button className="bd-item" onClick={() => p.onOpenProfile?.(item.id)} title="Edit in the character's profile">
                    <span><b>{item.name}</b>: {wardrobe}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}
      {canSceneTag && (
        <form className="bd-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <h3>Add to this scene</h3>
          <p className="hint">For things the scene needs that the script never mentions.</p>
          <div className="bd-add-row">
            <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {TAG_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
  const groups = TAG_CATEGORIES.map((c) => ({
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
          <h3><Dot category={c.id} />{c.name}<small>{items.length}</small></h3>
          <ul>
            {items.map((i) => editing === i.id
              ? <ItemEditor key={i.id} item={i} items={p.items} onSave={(patch) => { p.onUpdateItem(i.id, patch); setEditing(null); }}
                  onDelete={() => { p.onDeleteItem(i.id); setEditing(null); }} onCancel={() => setEditing(null)} />
              : (
                <li key={i.id} className={p.focusId === i.id ? 'focus' : ''}>
                  <button className="bd-item" onClick={() => p.onFind(i.id)} title={i.notes || 'Show next use in script'} disabled={!counts.get(i.id)}>
                    <span>{i.name}</span>
                    <small>{counts.get(i.id) ? `sc. ${(scenes.get(i.id) ?? []).map((n) => n || '–').join(', ')}` : 'unused'}</small>
                  </button>
                  {i.category === 'cast' && p.onOpenProfile && (
                    <button className="bd-x" title="Character profile" aria-label={`${i.name}'s profile`} onClick={() => p.onOpenProfile!(i.id)}>ⓘ</button>
                  )}
                  <button className="bd-x" aria-label={`Edit ${i.name}`} title="Rename, recategorize or delete" onClick={() => setEditing(i.id)}>✎</button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemEditor({ item, items, onSave, onDelete, onCancel }: {
  item: TagItem; items: TagItem[]; onSave: (p: Partial<TagItem>) => void; onDelete: () => void; onCancel: () => void;
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
          {TAG_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
