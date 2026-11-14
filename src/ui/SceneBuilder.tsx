import { useEffect, useMemo, useState } from 'react';
import { AssistSettings } from '../assist/levels';
import { DocTypeDef, getElement } from '../doctypes';
import { Block, TagItem, blockText } from '../model';
import { SCENE_PREFIXES, knownTimes, likelySpeakers, parseHeading } from '../editor/smarttype';
import { BuildOptions, SavedStructure, structuresFor } from '../structures';

interface Props {
  dt: DocTypeDef;
  blocks: Block[];
  /** Element the scene goes in place of. */
  index: number;
  tags: TagItem[];
  settings: AssistSettings;
  saved: SavedStructure[];
  /** Template to start on, e.g. from "/intercut". */
  initialStructure?: string;
  /** Element types of the scene above, if there is one, for "save as template". */
  canSaveLayout: boolean;
  onInsert: (blocks: Block[]) => void;
  onSaveLayout: (name: string) => void;
  onClose: () => void;
}

const PREFIXES = SCENE_PREFIXES.filter((p) => p !== 'I/E. ');

export function SceneBuilder({ dt, blocks, index, tags, settings, saved, initialStructure, canSaveLayout, onInsert, onSaveLayout, onClose }: Props) {
  const screenplay = dt.elements.some((e) => e.smartType === 'sceneHeading');
  const structures = structuresFor(dt.id, saved);
  const help = settings.sceneBuilderHelp;

  const sceneNo = useMemo(() => blocks.slice(0, index).filter((b) => b.type === 'scene').length + 1, [blocks, index]);
  const places = useMemo(() => {
    const set = new Set<string>();
    for (const b of blocks) if (getElement(dt, b.type).smartType === 'sceneHeading') {
      const l = parseHeading(blockText(b)).locations;
      for (let k = 1; k <= l.length; k++) set.add(l.slice(0, k).join(' - '));
    }
    tags.filter((t) => t.category === 'locations').forEach((t) => set.add(t.name.toUpperCase()));
    return [...set];
  }, [blocks, dt, tags]);
  const times = useMemo(() => knownTimes(dt, blocks, index), [dt, blocks, index]);
  const cast = useMemo(() => likelySpeakers(dt, blocks, index, tags), [dt, blocks, index, tags]);

  const [prefix, setPrefix] = useState(PREFIXES[0]);
  const [place, setPlace] = useState('');
  const [time, setTime] = useState('DAY');
  const [title, setTitle] = useState(`SCENE ${sceneNo}`);
  const [chosen, setChosen] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [structure, setStructure] = useState(
    structures.find((s) => s.id === initialStructure)?.id ?? structures[0]?.id ?? '',
  );
  const [lines, setLines] = useState(6);
  const [shots, setShots] = useState(4);
  const [second, setSecond] = useState('');
  const [goal, setGoal] = useState('');
  const [conflict, setConflict] = useState('');
  const [turn, setTurn] = useState('');
  const [templateName, setTemplateName] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const def = structures.find((s) => s.id === structure) ?? structures[0];
  // No place yet: leave the heading empty with a hint rather than print "INT. - DAY".
  const heading = screenplay
    ? (place.trim() ? `${prefix}${place.trim().toUpperCase()}${time.trim() ? ` - ${time.trim().toUpperCase()}` : ''}` : '')
    : title.trim().toUpperCase();
  const note = [goal && `Goal: ${goal.trim()}`, conflict && `Conflict: ${conflict.trim()}`, turn && `Turn: ${turn.trim()}`]
    .filter(Boolean).join('\n');
  const options: BuildOptions = { heading, characters: chosen, lines, second: second.trim().toUpperCase(), shots, note };
  const preview = def ? def.build(options) : [];

  const toggle = (name: string) => setChosen((c) => (c.includes(name) ? c.filter((n) => n !== name) : [...c, name]));
  const addExtra = () => {
    const n = extra.trim().toUpperCase();
    if (n && !chosen.includes(n)) setChosen([...chosen, n]);
    setExtra('');
  };

  const noteField = (label: string, value: string, set: (v: string) => void, prompt: string) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={settings.sceneNotes === 'prompts' ? prompt : ''} />
    </label>
  );
  const notes = (
    <div className="sb-notes">
      {noteField('Goal', goal, setGoal, 'What does someone want in this scene?')}
      {noteField('Conflict', conflict, setConflict, 'What stands in their way?')}
      {noteField('Turn', turn, setTurn, 'What has changed by the end?')}
    </div>
  );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal scene-builder" role="dialog" aria-label="Scene builder" onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (preview.length) onInsert(preview); }}>
        <h2>New scene</h2>
        {help && <p className="hint">Choose where and when, who is in it, and a shape. The scene appears with grey hints to write into; nothing here writes the scene for you.</p>}

        <div className="sb-grid">
          <div className="sb-main">
            {screenplay ? (
              <fieldset>
                <legend>Where and when</legend>
                <div className="segmented small" role="radiogroup" aria-label="Inside or outside">
                  {PREFIXES.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={prefix === p} className={prefix === p ? 'on' : ''}
                      onClick={() => setPrefix(p)}>{p.trim()}</button>
                  ))}
                </div>
                {help && <small className="hint">INT. is inside, EXT. is outside.</small>}
                <label>
                  <span>Place{help && ' (add " - " for a room inside it, like HOUSE - KITCHEN)'}</span>
                  <input autoFocus list="sb-places" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="LIGHTHOUSE - LAMP ROOM" />
                  <datalist id="sb-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
                </label>
                <label>
                  <span>Time of day</span>
                  <input list="sb-times" value={time} onChange={(e) => setTime(e.target.value)} />
                  <datalist id="sb-times">{times.map((t) => <option key={t} value={t} />)}</datalist>
                </label>
              </fieldset>
            ) : (
              <fieldset>
                <legend>Scene</legend>
                <label>
                  <span>Heading</span>
                  <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
              </fieldset>
            )}

            <fieldset>
              <legend>Who is in it</legend>
              {help && <small className="hint">Speeches come in the order you pick people.</small>}
              <div className="sb-cast">
                {[...new Set([...cast, ...chosen])].slice(0, 18).map((n) => (
                  <button key={n} type="button" className={`tag-cat${chosen.includes(n) ? ' on' : ''}`} aria-pressed={chosen.includes(n)}
                    onClick={() => toggle(n)}>
                    {chosen.includes(n) && <b>{chosen.indexOf(n) + 1}</b>}{n}
                  </button>
                ))}
              </div>
              <div className="add-row">
                <input aria-label="Add someone" placeholder="Someone new" value={extra} onChange={(e) => setExtra(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} />
                <button type="button" onClick={addExtra} disabled={!extra.trim()}>Add</button>
              </div>
            </fieldset>

            <fieldset>
              <legend>Shape</legend>
              <div className="sb-structures" role="radiogroup" aria-label="Scene shape">
                {structures.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={structure === s.id}
                    className={`level-card${structure === s.id ? ' selected' : ''}`} onClick={() => setStructure(s.id)}>
                    <span className="theme-name">{s.name}</span>
                    {(help || s.id.startsWith('saved:')) && <small>{s.description}</small>}
                  </button>
                ))}
              </div>
              {def?.uses?.second && (
                <label>
                  <span>Second place</span>
                  <input value={second} onChange={(e) => setSecond(e.target.value)} placeholder="EXT. PHONE BOOTH - NIGHT" />
                </label>
              )}
              {def?.uses?.lines && (
                <label className="inline">
                  <span>Speeches</span>
                  <input type="number" min={2} max={30} value={lines} onChange={(e) => setLines(Math.max(2, Math.min(30, Number(e.target.value) || 2)))} />
                </label>
              )}
              {def?.uses?.shots && (
                <label className="inline">
                  <span>Images</span>
                  <input type="number" min={2} max={12} value={shots} onChange={(e) => setShots(Math.max(2, Math.min(12, Number(e.target.value) || 2)))} />
                </label>
              )}
            </fieldset>

            <fieldset>
              <legend>Scene notes {help && <small className="hint">(never printed)</small>}</legend>
              {settings.sceneNotes === 'collapsed' ? <details><summary>Goal, conflict, turn</summary>{notes}</details> : notes}
            </fieldset>
          </div>

          <aside className="sb-preview" aria-label="Preview">
            <h3>Preview</h3>
            <ol>
              {preview.map((b, i) => (
                <li key={i} className={`pv pv-${b.type}`}>
                  <small>{getElement(dt, b.type).label}</small>
                  <span className={blockText(b) ? '' : 'pv-hint'}>{blockText(b) || b.hint || '…'}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <div className="modal-actions">
          {canSaveLayout && templateName === null && (
            <button type="button" onClick={() => setTemplateName('')}
              title="Save the layout of the scene above the cursor as a template for this pop-up">Save scene above as template…</button>
          )}
          {templateName !== null && (
            <span className="add-row">
              <input autoFocus aria-label="Template name" placeholder="Template name" value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (templateName.trim()) { onSaveLayout(templateName.trim()); setTemplateName(null); } } }} />
              <button type="button" disabled={!templateName.trim()} onClick={() => { onSaveLayout(templateName.trim()); setTemplateName(null); }}>Save</button>
            </span>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!preview.length}>Insert scene</button>
        </div>
      </form>
    </div>
  );
}
