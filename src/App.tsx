import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { docTypeList, getDocType, getElement } from './doctypes';
import { Editor, docTypeCss } from './editor/Editor';
import { setElementType } from './editor/commands';
import { download, NATIVE_EXT, parseFile, safeName, toFdx, toFountain } from './io/files';
import { paginate } from './io/paginate';
import { scriptToPdf } from './io/pdf';
import { Block, Script, TitlePage, blockText } from './model';
import { sampleScreenplay } from './sample';
import { ScriptMeta, blankScript, deleteScript, listScripts, loadScript, newId, saveScript } from './storage';
import { TitlePageDialog } from './ui/TitlePageDialog';

const LAST = 'scriptflow:last';

function initial(): { id: string; script: Script } {
  let id: string | null = null;
  try { id = localStorage.getItem(LAST); } catch { /* ignore */ }
  const s = id ? loadScript(id) : null;
  if (id && s) return { id, script: s };
  const first = listScripts()[0];
  if (first) { const f = loadScript(first.id); if (f) return { id: first.id, script: f }; }
  const nid = newId();
  saveScript(nid, sampleScreenplay);
  return { id: nid, script: sampleScreenplay };
}

export function App() {
  const [{ id, script: loaded }, setCurrent] = useState(initial);
  const [script, setScript] = useState<Script>(loaded);
  const [library, setLibrary] = useState<ScriptMeta[]>(listScripts);
  const [element, setElement] = useState('');
  const [titleOpen, setTitleOpen] = useState(false);
  const [sceneNumbers, setSceneNumbers] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState('');
  const viewRef = useRef<EditorView | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number>();

  const dt = getDocType(script.docType);
  const css = useMemo(() => docTypeList.map(docTypeCss).join('\n'), []);

  useEffect(() => { try { localStorage.setItem(LAST, id); } catch { /* ignore */ } }, [id]);

  const persist = (next: Script) => {
    setScript(next);
    setSaved(false);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveScript(id, next); setSaved(true); setLibrary(listScripts());
    }, 400);
  };

  const flush = () => {
    window.clearTimeout(saveTimer.current);
    saveScript(id, script); setSaved(true);
  };

  const open = (nid: string, s: Script) => {
    flush();
    setCurrent({ id: nid, script: s });
    setScript(s);
    setLibrary(listScripts());
  };

  const createNew = (docType: string) => {
    const nid = newId();
    const s = blankScript(docType);
    saveScript(nid, s);
    open(nid, s);
  };

  const onImport = async (file: File) => {
    try {
      const s = parseFile(file.name, await file.text());
      if (!s.titlePage.title) s.titlePage.title = file.name.replace(/\.[^.]+$/, '');
      const nid = newId();
      saveScript(nid, s);
      open(nid, s);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be opened.');
    }
  };

  const remove = (mid: string) => {
    if (!confirm('Delete this script from this browser? Export it first if you want a copy.')) return;
    deleteScript(mid);
    const rest = listScripts();
    setLibrary(rest);
    if (mid === id) {
      const r = rest[0];
      const s = r && loadScript(r.id);
      if (r && s) { setCurrent({ id: r.id, script: s }); setScript(s); }
      else createNew('screenplay');
    }
  };

  const nav = useMemo(() => {
    let n = 0;
    return script.blocks.map((b, i) => ({ b, i, el: getElement(dt, b.type) }))
      .filter(({ el }) => el.sceneStart || el.sectionStart)
      .map(({ b, i, el }) => ({ i, section: !!el.sectionStart, num: el.sceneStart ? ++n : 0, text: blockText(b) || '(untitled)' }));
  }, [script.blocks, dt]);

  const sceneCount = nav.filter((n) => !n.section).length;
  const pageCount = useMemo(() => paginate(dt, script.blocks).length, [script.blocks, dt]);

  const jumpTo = (index: number) => {
    const view = viewRef.current;
    if (!view) return;
    let pos = 0;
    view.state.doc.forEach((n, offset, i) => { if (i === index) pos = offset + 1; });
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))).scrollIntoView());
    view.focus();
    (view.domAtPos(pos).node as HTMLElement).parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const changeElement = (type: string) => {
    const view = viewRef.current;
    if (!view) return;
    setElementType(type)(view.state, view.dispatch);
    view.focus();
  };

  const exportAs = (kind: string) => {
    flush();
    const name = safeName(script);
    if (kind === 'pdf') scriptToPdf(script, { sceneNumbers }).save(`${name}.pdf`);
    if (kind === 'fountain') download(`${name}.fountain`, toFountain(script));
    if (kind === 'fdx') download(`${name}.fdx`, toFdx(script), 'application/xml');
    if (kind === 'native') download(`${name}${NATIVE_EXT}`, JSON.stringify(script, null, 2), 'application/json');
  };

  return (
    <div className="app">
      <style>{css}</style>
      <header className="topbar">
        <div className="brand">Right Write Wright</div>
        <button className="title-btn" onClick={() => setTitleOpen(true)} title="Edit title page">
          {script.titlePage.title || 'Untitled'}
          <span className="badge">{dt.name}</span>
        </button>
        <label className="element-picker">
          <span className="sr-only">Element</span>
          <select value={element} onChange={(e) => changeElement(e.target.value)}>
            {dt.elements.map((e, i) => (
              <option key={e.id} value={e.id}>{e.label}{i < 9 ? `  (⌘${i + 1})` : ''}</option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <button onClick={() => fileInput.current?.click()}>Import</button>
        <input
          ref={fileInput} type="file" hidden
          accept=".fountain,.spmd,.txt,.fdx,.scriptflow,.json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
        />
        <label className="export">
          <span className="sr-only">Export</span>
          <select value="" onChange={(e) => exportAs(e.target.value)}>
            <option value="" disabled>Export…</option>
            <option value="pdf">PDF</option>
            <option value="fdx">Final Draft (.fdx)</option>
            <option value="fountain" disabled={!dt.fountain}>Fountain{dt.fountain ? '' : ' (screenplays only)'}</option>
            <option value="native">Right Write Wright file (.scriptflow)</option>
          </select>
        </label>
      </header>

      {error && <div className="error" role="alert">{error} <button onClick={() => setError('')}>Dismiss</button></div>}

      <aside className="sidebar">
        <section>
          <h2>Scripts</h2>
          <div className="new-row">
            {docTypeList.map((d) => <button key={d.id} onClick={() => createNew(d.id)}>+ {d.name}</button>)}
          </div>
          <ul className="library">
            {library.map((m) => (
              <li key={m.id} className={m.id === id ? 'active' : ''}>
                <button className="lib-open" onClick={() => { const s = loadScript(m.id); if (s && m.id !== id) open(m.id, s); }}>
                  <span>{m.title}</span><small>{getDocType(m.docType).name}</small>
                </button>
                <button className="lib-del" aria-label={`Delete ${m.title}`} onClick={() => remove(m.id)}>×</button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>{dt.id === 'stageplay' ? 'Acts & scenes' : 'Scenes'}</h2>
          {nav.length === 0 && <p className="hint">Scene headings appear here.</p>}
          <ol className="navigator">
            {nav.map((s) => (
              <li key={s.i} className={s.section ? 'section' : ''}>
                <button onClick={() => jumpTo(s.i)}>
                  {!s.section && <span className="num">{s.num}</span>}
                  <span className="txt">{s.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      <main className="workspace">
        <Editor
          key={id}
          docType={dt}
          initial={loaded}
          viewRef={viewRef}
          onChange={(blocks: Block[]) => persist({ ...script, blocks })}
          onElementChange={setElement}
        />
      </main>

      <footer className="statusbar">
        <span>{getElement(dt, element || dt.firstElement).label}</span>
        <span>{sceneCount} {sceneCount === 1 ? 'scene' : 'scenes'}</span>
        <span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
        <label><input type="checkbox" checked={sceneNumbers} onChange={(e) => setSceneNumbers(e.target.checked)} /> Scene numbers in PDF</label>
        <span className="saved">{saved ? 'Saved' : 'Saving…'}</span>
        <span className="keys">Enter: next element · Tab: change element · Shift+Enter: line break</span>
      </footer>

      {titleOpen && (
        <TitlePageDialog
          value={script.titlePage}
          onClose={() => setTitleOpen(false)}
          onSave={(tp: TitlePage) => { persist({ ...script, titlePage: tp }); setTitleOpen(false); }}
        />
      )}
    </div>
  );
}
