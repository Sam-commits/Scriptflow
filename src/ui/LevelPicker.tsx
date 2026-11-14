import { useState } from 'react';
import { LEVELS, PresetId } from '../assist/levels';

/** Asked once, the first time the app opens: how much help would you like? */
export function LevelPicker({ onPick }: { onPick: (level: PresetId, tour: boolean) => void }) {
  const [level, setLevel] = useState<PresetId>('intermediate');
  const [tour, setTour] = useState(true);
  return (
    <div className="modal-backdrop">
      <form className="modal level-picker" role="dialog" aria-label="Choose your level"
        onSubmit={(e) => { e.preventDefault(); onPick(level, level === 'beginner' && tour); }}>
        <h2>How much help would you like while you write?</h2>
        <p className="hint">You can change this any time with the Assist button in the top bar, or build your own mix.</p>
        <div className="level-grid three" role="radiogroup" aria-label="Assistance level">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={level === l.id}
              className={`level-card${level === l.id ? ' selected' : ''}`} onClick={() => setLevel(l.id)}>
              <span className="theme-name">{l.name}</span>
              <small>{l.description}</small>
            </button>
          ))}
        </div>
        {level === 'beginner' && (
          <label className="check">
            <input type="checkbox" checked={tour} onChange={(e) => setTour(e.target.checked)} />
            Walk me through writing a first scene
          </label>
        )}
        <div className="modal-actions">
          <button type="button" onClick={() => onPick('intermediate', false)}>Decide later</button>
          <button type="submit" className="primary">Start writing</button>
        </div>
      </form>
    </div>
  );
}
