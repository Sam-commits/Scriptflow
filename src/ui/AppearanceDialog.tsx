import { useEffect } from 'react';
import {
  AppearanceSettings, DEFAULT_APPEARANCE, ThemeDef, ThemeMode, ZOOM_MAX, ZOOM_MIN, accents, themesFor,
} from '../themes';

interface Props {
  settings: AppearanceSettings;
  mode: ThemeMode;
  onChange: (patch: Partial<AppearanceSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const MODES: { id: AppearanceSettings['mode']; label: string }[] = [
  { id: 'system', label: 'Follow system' }, { id: 'light', label: 'Always light' }, { id: 'dark', label: 'Always dark' },
];
const VIEWS: { id: AppearanceSettings['pageView']; label: string; hint: string }[] = [
  { id: 'paged', label: 'Pages', hint: 'Separate sheets, like the PDF' },
  { id: 'continuous', label: 'Continuous', hint: 'One sheet, breaks shown as a line' },
  { id: 'draft', label: 'Draft', hint: 'No page edges or breaks' },
];

function ThemeCard({ theme, selected, onPick }: { theme: ThemeDef; selected: boolean; onPick: () => void }) {
  const t = theme.tokens;
  return (
    <button type="button" className={`theme-card${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onPick}>
      <span className="theme-swatch" style={{ background: t.bg }}>
        <span className="theme-sheet" style={{ background: t.page, color: t.pageText, borderColor: t.pageBorder }}>
          <b>INT. ROOM - DAY</b><i /><i className="short" />
        </span>
        <span className="theme-dot" style={{ background: t.accent }} />
      </span>
      <span className="theme-name">{theme.name}</span>
      <small>{theme.description}</small>
    </button>
  );
}

export function AppearanceDialog({ settings: s, mode, onChange, onReset, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoomPct = s.zoom === 'fit' ? null : Math.round(s.zoom * 100);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal appearance" role="dialog" aria-label="Appearance" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Appearance</h2>
        <p className="hint">These change how the editor looks on your screen. Exported PDF and Final Draft files always stay black Courier on white.</p>

        <fieldset>
          <legend>Theme</legend>
          <div className="segmented" role="radiogroup">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={s.mode === m.id}
                className={s.mode === m.id ? 'on' : ''} onClick={() => onChange({ mode: m.id })}>{m.label}</button>
            ))}
          </div>
          {(['light', 'dark'] as const).map((m) => (
            <div key={m} className={`theme-group${mode === m ? ' showing' : ''}`}>
              <h3>{m === 'light' ? 'Light theme' : 'Dark theme'}{mode === m && <span className="badge">Showing now</span>}</h3>
              <div className="theme-grid">
                {themesFor(m).map((t) => (
                  <ThemeCard key={t.id} theme={t}
                    selected={(m === 'light' ? s.lightTheme : s.darkTheme) === t.id}
                    onPick={() => onChange(m === 'light' ? { lightTheme: t.id } : { darkTheme: t.id })} />
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset>
          <legend>Accent color</legend>
          <div className="accent-row">
            <button type="button" className={`accent-chip theme-default${s.accent === 'theme' ? ' on' : ''}`}
              aria-pressed={s.accent === 'theme'} onClick={() => onChange({ accent: 'theme' })}>Theme</button>
            {accents.map((a) => (
              <button key={a.id} type="button" className={`accent-chip${s.accent === a.id ? ' on' : ''}`}
                aria-pressed={s.accent === a.id} aria-label={a.name} title={a.name}
                style={{ background: a[mode].accent }} onClick={() => onChange({ accent: a.id })} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Page</legend>
          <label className="row">
            <span>Zoom</span>
            <input type="range" min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step={10}
              value={zoomPct ?? 100} disabled={s.zoom === 'fit'}
              onChange={(e) => onChange({ zoom: Number(e.target.value) / 100 })} />
            <output>{zoomPct === null ? 'Fit' : `${zoomPct}%`}</output>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.zoom === 'fit'} onChange={(e) => onChange({ zoom: e.target.checked ? 'fit' : 1 })} />
            Fit page to window width
          </label>
          <div className="view-grid" role="radiogroup" aria-label="Page view">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={s.pageView === v.id}
                className={`view-card vc-${v.id}${s.pageView === v.id ? ' selected' : ''}`} onClick={() => onChange({ pageView: v.id })}>
                <span className="view-pic" aria-hidden="true"><i /><i /></span>
                <span className="theme-name">{v.label}</span>
                <small>{v.hint}</small>
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={s.pageNumbers} disabled={s.pageView === 'draft'}
              onChange={(e) => onChange({ pageNumbers: e.target.checked })} />
            Show page numbers at page breaks
          </label>
          <label className="check">
            <input type="checkbox" checked={s.pageShadow} disabled={s.pageView === 'draft'}
              onChange={(e) => onChange({ pageShadow: e.target.checked })} />
            Page shadow
          </label>
        </fieldset>

        <div className="modal-actions">
          <button type="button" onClick={onReset}
            disabled={JSON.stringify(s) === JSON.stringify(DEFAULT_APPEARANCE)}>Reset to defaults</button>
          <div className="spacer" />
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
