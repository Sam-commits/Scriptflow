import { useState } from 'react';
import { TitlePage } from '../model';

const FIELDS: { key: keyof TitlePage; label: string; multiline?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'credit', label: 'Credit' },
  { key: 'author', label: 'Author(s)' },
  { key: 'source', label: 'Based on', multiline: true },
  { key: 'draftDate', label: 'Draft date' },
  { key: 'contact', label: 'Contact', multiline: true },
];

export function TitlePageDialog({ value, onSave, onClose }: {
  value: TitlePage; onSave: (v: TitlePage) => void; onClose: () => void;
}) {
  const [tp, setTp] = useState(value);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal" onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(tp); }}
      >
        <h2>Title page</h2>
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span>{f.label}</span>
            {f.multiline
              ? <textarea rows={2} value={tp[f.key]} onChange={(e) => setTp({ ...tp, [f.key]: e.target.value })} />
              : <input autoFocus={f.key === 'title'} value={tp[f.key]} onChange={(e) => setTp({ ...tp, [f.key]: e.target.value })} />}
          </label>
        ))}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </div>
  );
}
