import { useEffect, useRef, useState } from 'react';
import {
  AssistConfig, AssistSettings, LEVELS, LevelId, addCustom, exportCustoms, importCustoms, levelSettings,
  removeCustom, updateCustom,
} from '../assist/levels';
import { download } from '../io/files';
import { newId } from '../storage';

interface Props {
  config: AssistConfig;
  onChange: (c: AssistConfig) => void;
  onNames: () => void;
  onTour: () => void;
  onExample: () => void;
  onClose: () => void;
}

type Row =
  | { key: keyof AssistSettings; label: string; kind: 'bool' }
  | { key: keyof AssistSettings; label: string; kind: 'choice'; options: [string, string][] }
  | { key: keyof AssistSettings; label: string; kind: 'number'; min: number; max: number; step: number; unit?: string };

interface Group { title: string; rows: Row[] }

/** Every switch a Custom setup can change, grouped as in the plan. */
export const ASSIST_GROUPS: Group[] = [
  {
    title: 'SmartType',
    rows: [
      { key: 'smartType', label: 'SmartType dropdown (names, places, times, transitions)', kind: 'bool' },
      { key: 'smartTypeEager', label: 'Open the dropdown on an empty line', kind: 'bool' },
      { key: 'smartTypeMax', label: 'Longest list', kind: 'number', min: 3, max: 12, step: 1 },
      { key: 'nextSpeaker', label: 'Who speaks next, on an empty Character line', kind: 'choice', options: [['dropdown', 'Dropdown'], ['ghost', 'Ghost text'], ['off', 'Off']] },
    ],
  },
  {
    title: 'Ghost text',
    rows: [
      { key: 'ghostStructure', label: "Structure: heading prefixes, transitions, (CONT'D)", kind: 'bool' },
      { key: 'ghostPhrases', label: "Phrases you've already used in dialogue and action", kind: 'bool' },
      { key: 'ghostDelay', label: 'Wait after typing stops', kind: 'number', min: 0, max: 2000, step: 100, unit: 'ms' },
      { key: 'acceptKey', label: 'Accept ghost text with', kind: 'choice', options: [['both', 'Tab or →'], ['tab', 'Tab'], ['right', '→']] },
    ],
  },
  {
    title: 'Scene builder',
    rows: [
      { key: 'sceneBuilder', label: '/ commands and the scene builder pop-up', kind: 'bool' },
      { key: 'sceneBuilderHelp', label: 'Explanations in the pop-up', kind: 'bool' },
      { key: 'sceneNotes', label: 'Scene notes (goal, conflict, turn)', kind: 'choice', options: [['prompts', 'With prompts'], ['shown', 'Shown'], ['collapsed', 'Folded away']] },
      { key: 'hints', label: 'Grey hints in empty lines', kind: 'choice', options: [['all', 'Everywhere'], ['builder', 'Scene builder only'], ['off', 'Off']] },
    ],
  },
  {
    title: 'Coaching',
    rows: [
      { key: 'elementGuide', label: 'Element guide in the status bar', kind: 'choice', options: [['full', 'Full'], ['name', 'Name only'], ['off', 'Off']] },
      { key: 'formatCoach', label: 'Format coach underlines', kind: 'choice', options: [['all', 'All tips'], ['serious', 'Real mistakes only'], ['off', 'Off']] },
    ],
  },
];

function SettingRow({ row, value, disabled, onChange }: {
  row: Row; value: AssistSettings[keyof AssistSettings]; disabled: boolean; onChange: (v: unknown) => void;
}) {
  if (row.kind === 'bool') {
    return (
      <label className="check">
        <input type="checkbox" checked={value as boolean} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {row.label}
      </label>
    );
  }
  if (row.kind === 'choice') {
    return (
      <div className="assist-row">
        <span>{row.label}</span>
        <div className="segmented small" role="radiogroup" aria-label={row.label}>
          {row.options.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled}
              className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <label className="assist-row">
      <span>{row.label}</span>
      <span className="num-input">
        <input type="number" min={row.min} max={row.max} step={row.step} value={value as number} disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))} />
        {row.unit && <small>{row.unit}</small>}
      </span>
    </label>
  );
}

export function AssistDialog({ config: c, onChange, onNames, onTour, onExample, onClose }: Props) {
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const settings = levelSettings(c);
  const custom = c.level === 'custom' ? c.customs.find((x) => x.id === c.activeCustom) : undefined;
  const pick = (level: LevelId) => {
    if (level === 'custom' && !c.customs.length) onChange({ ...addCustom(c, 'My setup', newId()), chosen: true });
    else onChange({ ...c, level, chosen: true, ghost: null });
  };
  const set = (key: keyof AssistSettings, v: unknown) => {
    if (!custom) return;
    onChange(updateCustom(c, custom.id, { settings: { ...custom.settings, [key]: v } }));
  };
  const onImport = async (f: File) => {
    try { onChange(importCustoms(c, await f.text(), newId)); setError(''); } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal assist" role="dialog" aria-label="Writing assistant" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Writing assistant</h2>
        <p className="hint">Pick how much help you want. Everything works offline from your own script, and none of it changes what prints or exports.</p>

        <div className="level-grid" role="radiogroup" aria-label="Assistance level">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={c.level === l.id}
              className={`level-card${c.level === l.id ? ' selected' : ''}`} onClick={() => pick(l.id)}>
              <span className="theme-name">{l.name}</span>
              <small>{l.description}</small>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={c.level === 'custom'}
            className={`level-card${c.level === 'custom' ? ' selected' : ''}`} onClick={() => pick('custom')}>
            <span className="theme-name">Custom</span>
            <small>{c.customs.length ? `Your own setups (${c.customs.length}). Every switch is yours.` : 'Start from your current level and set every switch yourself.'}</small>
          </button>
        </div>

        {custom && (
          <div className="custom-bar">
            <label className="sr-only" htmlFor="custom-pick">Setup</label>
            <select id="custom-pick" value={custom.id} onChange={(e) => onChange({ ...c, activeCustom: e.target.value, ghost: null })}>
              {c.customs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input aria-label="Setup name" value={custom.name} maxLength={40}
              onChange={(e) => onChange(updateCustom(c, custom.id, { name: e.target.value }))} />
            <button type="button" onClick={() => onChange(addCustom(c, `Setup ${c.customs.length + 1}`, newId()))}>New</button>
            <button type="button" className="danger"
              onClick={() => { if (confirm(`Delete the setup "${custom.name}"?`)) onChange(removeCustom(c, custom.id)); }}>Delete</button>
            <span className="spacer" />
            <button type="button" onClick={() => download('assistant setups.json', exportCustoms(c), 'application/json')}>Export</button>
            <button type="button" onClick={() => fileRef.current?.click()}>Import</button>
            <input ref={fileRef} type="file" accept=".json" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
          </div>
        )}
        {!custom && (
          <p className="hint">
            These are the {LEVELS.find((l) => l.id === c.level)?.name} switches.{' '}
            <button type="button" className="link" onClick={() => onChange(addCustom(c, `My ${LEVELS.find((l) => l.id === c.level)?.name ?? ''} setup`, newId()))}>
              Customize a copy
            </button>{' '}to change any of them.
          </p>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}

        <div className="assist-groups">
          {ASSIST_GROUPS.map((g) => (
            <fieldset key={g.title} disabled={!custom}>
              <legend>{g.title}</legend>
              {g.rows.map((r) => (
                <SettingRow key={r.key} row={r} value={settings[r.key]} disabled={!custom} onChange={(v) => set(r.key, v)} />
              ))}
            </fieldset>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onNames}>Names &amp; places…</button>
          <button type="button" onClick={onTour}>First-scene walk-through</button>
          <button type="button" onClick={onExample}>Annotated example</button>
          <div className="spacer" />
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
