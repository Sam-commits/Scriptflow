import { ReactNode, useMemo, useState } from 'react';
import { DocTypeDef, getElement } from '../doctypes';
import { ArcBeat, Block, CharacterProfile, Relationship, SceneNote, TagItem, blockText } from '../model';
import { newId } from '../storage';
import { SceneRange, normName, sceneAt, sceneRanges, speakerName } from '../tags/breakdown';
import { Appearance, characterAppearances } from '../characters/appearances';
import {
  ARC_FIELDS, ListKey, NOTES_FIELD, PROFILE_SECTIONS, RELATIONSHIP_KINDS, ROLES, TextField, castItems,
  profileHasContent, refOf, resolveScene,
} from '../characters/profiles';

type Update = (fn: (p: CharacterProfile) => CharacterProfile) => void;

interface Props {
  dt: DocTypeDef;
  blocks: Block[];
  items: TagItem[];
  profiles: CharacterProfile[];
  cursorIndex: number;
  /** Cast item whose profile is open, or null for the list. */
  selected: string | null;
  onSelect: (itemId: string | null) => void;
  onUpdate: (itemId: string, fn: (p: CharacterProfile) => CharacterProfile) => void;
  onClear: (itemId: string) => void;
  /** Make sure a Cast item exists for this name; returns its id. */
  onEnsureCast: (name: string) => string;
  onAutoCast: () => void;
  /** Put the cursor on element `index`, selecting characters [from, to) of its text if given. */
  onJump: (index: number, from?: number, to?: number) => void;
  onExport: () => void;
  onClose: () => void;
}

const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

export function CharactersPanel(p: Props) {
  const scenes = useMemo(() => sceneRanges(p.dt, p.blocks), [p.dt, p.blocks]);
  const item = p.selected ? p.items.find((i) => i.id === p.selected && i.category === 'cast') : undefined;
  return (
    <aside className="breakdown characters" aria-label="Characters">
      <div className="bd-head">
        {item
          ? <button className="link back" onClick={() => p.onSelect(null)}>‹ All characters</button>
          : <h2>Characters</h2>}
        <button className="icon-btn" aria-label="Close characters" onClick={p.onClose}>×</button>
      </div>
      {item
        ? <Profile key={item.id} {...p} item={item} scenes={scenes} profile={p.profiles.find((x) => x.itemId === item.id)} />
        : <CharacterList {...p} />}
    </aside>
  );
}

// ---- List ---------------------------------------------------------------------

function CharacterList(p: Props) {
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const cast = castItems(p.items);
  const rows = useMemo(() => {
    const byName = new Set(cast.map((i) => normName(speakerName(i.name))));
    // Speakers nobody has tagged yet still get a row; opening one creates its Cast item.
    const untagged = new Set<string>();
    p.blocks.forEach((b) => {
      if (!getElement(p.dt, b.type).speaker) return;
      const n = speakerName(blockText(b)).toUpperCase();
      if (n && !byName.has(normName(n))) untagged.add(n);
    });
    const roleRank = (r?: string) => { const i = ROLES.findIndex((x) => x.toLowerCase() === r?.trim().toLowerCase()); return i < 0 ? ROLES.length : i; };
    return [
      ...cast.map((i) => {
        const prof = p.profiles.find((x) => x.itemId === i.id);
        const a = characterAppearances(p.dt, p.blocks, i, prof);
        return { key: i.id, id: i.id as string | null, name: i.name, role: prof?.role, filled: profileHasContent(prof), a };
      }),
      ...[...untagged].map((n) => {
        const a = characterAppearances(p.dt, p.blocks, { id: '', category: 'cast', name: n });
        return { key: `new:${n}`, id: null, name: n, role: undefined, filled: false, a };
      }),
    ].sort((x, y) => roleRank(x.role) - roleRank(y.role) || y.a.speeches - x.a.speeches || x.name.localeCompare(y.name));
  }, [p.dt, p.blocks, p.profiles, cast]);
  const f = filter.trim().toLowerCase();
  const shown = rows.filter((r) => !f || r.name.toLowerCase().includes(f) || r.role?.toLowerCase().includes(f));
  const hasSpeakers = p.dt.elements.some((e) => e.speaker);
  const add = () => { const n = name.trim(); if (!n) return; p.onSelect(p.onEnsureCast(n)); setName(''); };

  return (
    <div className="bd-all">
      <p className="hint">Profiles, wants and needs, flaws, arcs, relationships, and every scene each character is in. Notes here are never printed.</p>
      <div className="bd-tools">
        {hasSpeakers && <button onClick={p.onAutoCast} title="Tag every character cue and name in action as Cast">Tag all characters</button>}
        <button onClick={p.onExport} disabled={!p.profiles.some(profileHasContent)} title="All profiles as a Markdown document">Export profiles</button>
      </div>
      {rows.length > 6 && (
        <input className="bd-filter" type="search" placeholder="Filter characters" aria-label="Filter characters" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {!rows.length && <p className="hint">No characters yet. Write a character cue, tag a name as Cast, or add one below.</p>}
      <ul className="ch-list">
        {shown.map((r) => {
          const first = r.a.scenes.find((s) => s.scene.num > 0)?.scene.num;
          const sc = r.a.scenes.filter((s) => s.scene.num > 0).length;
          return (
            <li key={r.key}>
              <button className="ch-row" onClick={() => p.onSelect(r.id ?? p.onEnsureCast(r.name))}>
                <span className="ch-name">{r.name}{r.filled && <span className="ch-filled" title="Has a profile" aria-label="has a profile">●</span>}</span>
                {r.role && <span className="ch-role">{r.role}</span>}
                <small>
                  {r.a.scenes.length
                    ? `${plural(r.a.speeches, 'speech', 'speeches')} · ${plural(sc, 'scene')}${first ? ` · first in sc. ${first}` : ''}`
                    : 'not in the script yet'}
                </small>
              </button>
            </li>
          );
        })}
      </ul>
      <form className="bd-add-row two" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input aria-label="New character name" placeholder="Add a character" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={!name.trim()}>Add</button>
      </form>
    </div>
  );
}

// ---- Profile ------------------------------------------------------------------

type ProfileProps = Props & { item: TagItem; profile?: CharacterProfile; scenes: SceneRange[] };

function Field({ f, value, onChange, list }: { f: TextField; value?: string; onChange: (v: string) => void; list?: string }) {
  return (
    <label className="ch-field">
      <span>{f.label}</span>
      {f.long
        ? <textarea rows={2} placeholder={f.hint} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        : <input placeholder={f.hint} value={value ?? ''} list={list} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function ListField({ label, hint, values, onChange }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v) { onChange([...values, v]); setDraft(''); } };
  return (
    <div className="ch-field">
      <span>{label}</span>
      {values.length > 0 && (
        <ul className="ch-chips">
          {values.map((v, i) => (
            <li key={i} className="chip"><span title={v}>{v}</span>
              <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>×</button></li>
          ))}
        </ul>
      )}
      <form className="bd-add-row two" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input aria-label={hint} placeholder={hint} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" disabled={!draft.trim()}>Add</button>
      </form>
    </div>
  );
}

const filledCount = (prof: CharacterProfile | undefined, keys: (keyof CharacterProfile)[]) =>
  keys.filter((k) => { const v = prof?.[k]; return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''; }).length;

function Section({ title, count, open, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details className="ch-section" open={open}>
      <summary>{title}{count ? <small>{count}</small> : null}</summary>
      <div className="ch-body">{children}</div>
    </details>
  );
}

function SceneSelect({ value, scenes, onChange, label, empty = 'No scene' }: {
  value?: SceneRange; scenes: SceneRange[]; onChange: (s: SceneRange | undefined) => void; label: string; empty?: string;
}) {
  return (
    <select aria-label={label} value={value?.num ?? ''} onChange={(e) => onChange(scenes.find((s) => s.num === Number(e.target.value)))}>
      <option value="">{empty}</option>
      {scenes.filter((s) => s.num > 0).map((s) => <option key={s.num} value={s.num}>{s.num}. {s.heading}</option>)}
    </select>
  );
}

function Profile(p: ProfileProps) {
  const { item, profile: prof, scenes } = p;
  const update: Update = (fn) => p.onUpdate(item.id, fn);
  const set = (k: keyof CharacterProfile, v: unknown) => update((x) => ({ ...x, [k]: v }));
  const app = useMemo(() => characterAppearances(p.dt, p.blocks, item, prof), [p.dt, p.blocks, item, prof]);
  const others = castItems(p.items).filter((i) => i.id !== item.id);
  const nameOf = (id: string) => p.items.find((i) => i.id === id)?.name ?? '(deleted)';
  const incoming = p.profiles.flatMap((o) => (o.itemId === item.id ? [] : (o.relationships ?? [])
    .filter((r) => r.to === item.id).map((r) => ({ from: o.itemId, r }))));
  const [aliases, setAliases] = useState((prof?.aliases ?? []).join(', '));

  return (
    <div className="ch-profile">
      <div className="ch-title">
        <h3>{item.name}</h3>
        <small>
          {app.scenes.length
            ? `${plural(app.speeches, 'speech', 'speeches')} · ${plural(app.scenes.filter((s) => s.scene.num > 0).length, 'scene')} · ${plural(app.mentions, 'mention')}`
            : 'Not in the script yet'}
        </small>
      </div>
      <label className="ch-field">
        <span>Also called</span>
        <input placeholder="Other names the script uses, comma separated" value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          onBlur={() => set('aliases', aliases.split(',').map((s) => s.trim()).filter(Boolean))} />
      </label>

      <datalist id="ch-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
      {PROFILE_SECTIONS.map((sec, i) => (
        <Section key={sec.id} title={sec.title} open={i === 0}
          count={filledCount(prof, [...sec.fields.map((f) => f.key), ...(sec.lists ?? []).map((l) => l.key)])}>
          {sec.fields.map((f) => (
            <Field key={f.key} f={f} value={prof?.[f.key]} list={f.key === 'role' ? 'ch-roles' : undefined} onChange={(v) => set(f.key, v)} />
          ))}
          {(sec.lists ?? []).map((l) => (
            <ListField key={l.key} label={l.label} hint={l.hint} values={prof?.[l.key as ListKey] ?? []} onChange={(v) => set(l.key, v)} />
          ))}
        </Section>
      ))}

      <Section title="Arc" count={filledCount(prof, ['arcStart', 'arcEnd', 'arcBeats'])}>
        <Arc prof={prof} scenes={scenes} update={update} onJump={p.onJump} />
      </Section>

      <Section title="Relationships" count={(prof?.relationships?.length ?? 0) + incoming.length}>
        <Relationships prof={prof} others={others} update={update} />
        {incoming.length > 0 && (
          <div className="ch-field">
            <span>How others see {item.name}</span>
            <ul className="ch-incoming">
              {incoming.map(({ from, r }) => (
                <li key={r.id}><button className="link" onClick={() => p.onSelect(from)}>{nameOf(from)}</button>: {r.kind || 'related'}{r.notes ? `. ${r.notes}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Scenes, notes & wardrobe" open count={app.scenes.filter((s) => s.scene.num > 0).length}>
        <Scenes {...p} app={app.scenes} update={update} />
      </Section>

      <Section title="Notes" count={filledCount(prof, ['notes'])}>
        <Field f={NOTES_FIELD} value={prof?.notes} onChange={(v) => set('notes', v)} />
      </Section>

      {profileHasContent(prof) && (
        <div className="bd-edit-actions">
          <button className="danger" onClick={() => { if (confirm(`Clear ${item.name}'s profile? The script is not changed.`)) p.onClear(item.id); }}>Clear profile</button>
        </div>
      )}
    </div>
  );
}

function Arc({ prof, scenes, update, onJump }: { prof?: CharacterProfile; scenes: SceneRange[]; update: Update; onJump: Props['onJump'] }) {
  const beats = prof?.arcBeats ?? [];
  const setBeat = (id: string, patch: Partial<ArcBeat>) => update((x) => ({ ...x, arcBeats: (x.arcBeats ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const order = (b: ArcBeat) => (b.scene ? resolveScene(b.scene, scenes)?.num ?? 1e6 : 1e7);
  const sorted = [...beats].sort((a, b) => order(a) - order(b));
  return (
    <>
      {ARC_FIELDS.map((f) => <Field key={f.key} f={f} value={prof?.[f.key]} onChange={(v) => update((x) => ({ ...x, [f.key]: v }))} />)}
      <div className="ch-field">
        <span>Turning points</span>
        <ol className="ch-beats">
          {sorted.map((b) => {
            const s = b.scene && resolveScene(b.scene, scenes);
            return (
              <li key={b.id}>
                <textarea rows={2} aria-label="Turning point" placeholder="What changes for them" value={b.text} onChange={(e) => setBeat(b.id, { text: e.target.value })} />
                <div className="ch-beat-row">
                  <SceneSelect label="Scene" value={s || undefined} scenes={scenes} onChange={(sc) => setBeat(b.id, { scene: sc && refOf(sc) })} />
                  {b.scene && !s && <small className="danger" title={b.scene.heading}>scene removed</small>}
                  {s && <button className="link" onClick={() => onJump(s.start)}>Go</button>}
                  <button className="bd-x" aria-label="Remove turning point" onClick={() => update((x) => ({ ...x, arcBeats: (x.arcBeats ?? []).filter((y) => y.id !== b.id) }))}>×</button>
                </div>
              </li>
            );
          })}
        </ol>
        <button className="ch-add" onClick={() => update((x) => ({ ...x, arcBeats: [...(x.arcBeats ?? []), { id: newId(), text: '' }] }))}>+ Turning point</button>
      </div>
    </>
  );
}

function Relationships({ prof, others, update }: { prof?: CharacterProfile; others: TagItem[]; update: Update }) {
  const rels = prof?.relationships ?? [];
  const setRel = (id: string, patch: Partial<Relationship>) => update((x) => ({ ...x, relationships: (x.relationships ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  if (!others.length) return <p className="hint">Add another character to describe how they relate.</p>;
  return (
    <div className="ch-field">
      <datalist id="ch-kinds">{RELATIONSHIP_KINDS.map((k) => <option key={k} value={k} />)}</datalist>
      <ul className="ch-rels">
        {rels.map((r) => (
          <li key={r.id}>
            <div className="ch-rel-row">
              <select aria-label="Character" value={r.to} onChange={(e) => setRel(r.id, { to: e.target.value })}>
                {!others.some((o) => o.id === r.to) && <option value={r.to}>(deleted)</option>}
                {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <input aria-label="Relationship" list="ch-kinds" placeholder="Sister, rival…" value={r.kind} onChange={(e) => setRel(r.id, { kind: e.target.value })} />
              <button className="bd-x" aria-label="Remove relationship" onClick={() => update((x) => ({ ...x, relationships: (x.relationships ?? []).filter((y) => y.id !== r.id) }))}>×</button>
            </div>
            <textarea rows={1} aria-label="Relationship notes" placeholder="What's between them" value={r.notes ?? ''} onChange={(e) => setRel(r.id, { notes: e.target.value })} />
          </li>
        ))}
      </ul>
      <button className="ch-add" onClick={() => {
        const taken = new Set(rels.map((r) => r.to));
        const to = (others.find((o) => !taken.has(o.id)) ?? others[0]).id;
        update((x) => ({ ...x, relationships: [...(x.relationships ?? []), { id: newId(), to, kind: '' }] }));
      }}>+ Relationship</button>
    </div>
  );
}

const KIND_LABEL: Record<Appearance['kind'], string> = { speaks: 'Speaks', action: 'In action', named: 'Named', scene: 'Tagged on scene' };

function Scenes(p: ProfileProps & { app: ReturnType<typeof characterAppearances>['scenes']; update: Update }) {
  const { scenes, profile: prof, update } = p;
  const [extra, setExtra] = useState<number | null>(null);
  const notes = prof?.scenes ?? [];
  const noteFor = (s: SceneRange) => notes.find((n) => resolveScene(n.scene, scenes) === s);
  const orphans = notes.filter((n) => !resolveScene(n.scene, scenes));
  const here = sceneAt(scenes, p.cursorIndex);

  const setNote = (s: SceneRange, patch: Partial<SceneNote>) => update((x) => {
    const list = x.scenes ?? [];
    const cur = list.find((n) => resolveScene(n.scene, scenes) === s);
    return { ...x, scenes: cur ? list.map((n) => (n === cur ? { ...cur, ...patch } : n)) : [...list, { scene: refOf(s), ...patch }] };
  });

  // Scenes they're in, plus scenes with notes they're not (yet) in, plus one being added.
  const byNum = new Map(p.app.filter((a) => a.scene.num > 0).map((a) => [a.scene.num, a]));
  const shownNums = new Set<number>([...byNum.keys()]);
  notes.forEach((n) => { const s = resolveScene(n.scene, scenes); if (s && (n.note || n.wardrobe)) shownNums.add(s.num); });
  if (extra) shownNums.add(extra);
  const shown = scenes.filter((s) => shownNums.has(s.num)).map((s) => ({ s, a: byNum.get(s.num) }));
  const notIn = scenes.filter((s) => s.num > 0 && !shownNums.has(s.num));
  const before = p.app.find((a) => a.scene.num === 0);

  return (
    <>
      {!shown.length && <p className="hint">Not in any scene yet. Their cues, Cast tags and every time their name is written show up here.</p>}
      {before && <p className="hint">Also {plural(before.entries.length, 'mention')} before the first scene heading.</p>}
      <ul className="ch-scenes">
        {shown.map(({ s, a }) => {
          const n = noteFor(s);
          const kinds = new Map<string, number>();
          a?.entries.forEach((e) => kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1));
          return (
            <li key={s.num} className={here === s ? 'here' : ''}>
              <details open={here === s || s.num === extra}>
                <summary>
                  <span className="num">{s.num}</span>
                  <span className="ch-heading">{s.heading}</span>
                  {(n?.wardrobe || n?.note) && <span className="ch-filled" title="Has notes">●</span>}
                </summary>
                <div className="ch-scene-body">
                  <div className="ch-kinds">
                    {a ? [...kinds].map(([k, c]) => (
                      <span key={k} className="ch-kind">{k === 'speaks' ? plural(c, 'speech', 'speeches') : `${KIND_LABEL[k as Appearance['kind']]}${c > 1 ? ` ×${c}` : ''}`}</span>
                    )) : <span className="ch-kind muted">Not in this scene</span>}
                    <button className="link" onClick={() => p.onJump(s.start)}>Go to scene</button>
                  </div>
                  {a && (
                    <ul className="ch-entries">
                      {a.entries.map((e, i) => (
                        <li key={i}>
                          <button onClick={() => p.onJump(e.index, e.kind === 'scene' ? undefined : e.from, e.kind === 'scene' ? undefined : e.to)}
                            title="Show in script">
                            <small>{e.kind === 'named' && e.by ? `${e.by} says` : KIND_LABEL[e.kind]}</small>
                            <span>{e.snippet || '—'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="ch-field">
                    <span>Wardrobe</span>
                    <input placeholder="What they wear in this scene" value={n?.wardrobe ?? ''} onChange={(e) => setNote(s, { wardrobe: e.target.value })} />
                  </label>
                  <label className="ch-field">
                    <span>Scene notes</span>
                    <textarea rows={2} placeholder="Their goal, mood, what changes for them here" value={n?.note ?? ''} onChange={(e) => setNote(s, { note: e.target.value })} />
                  </label>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {notIn.length > 0 && (
        <SceneSelect label="Add notes for another scene" empty="Add notes for another scene…" scenes={notIn}
          onChange={(s) => { if (s) setExtra(s.num); }} />
      )}
      {orphans.length > 0 && (
        <div className="ch-field">
          <span>Notes for scenes no longer in the script</span>
          <ul className="ch-orphans">
            {orphans.map((n, i) => (
              <li key={i}>
                <p><b>{n.scene.heading}</b>{n.wardrobe ? ` · Wardrobe: ${n.wardrobe}` : ''}{n.note ? ` · ${n.note}` : ''}</p>
                <div className="ch-beat-row">
                  <SceneSelect label="Move to scene" empty="Move to scene…" scenes={scenes}
                    onChange={(s) => { if (s) update((x) => ({ ...x, scenes: (x.scenes ?? []).map((y) => (y === n ? { ...y, scene: refOf(s) } : y)) })); }} />
                  <button className="bd-x" aria-label="Delete these notes" onClick={() => update((x) => ({ ...x, scenes: (x.scenes ?? []).filter((y) => y !== n) }))}>×</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
