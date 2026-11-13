import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { docTypeList, getDocType, getElement } from './doctypes';
import { Editor, docTypeCss } from './editor/Editor';
import { setElementType } from './editor/commands';
import { download, NATIVE_EXT, parseFile, safeName, toFdx, toFountain } from './io/files';
import { paginate, pageStarts } from './io/paginate';
import { scriptToPdf } from './io/pdf';
import { Block, Script, TitlePage, blockText } from './model';
import { sampleScreenplay } from './sample';
import { ScriptMeta, blankScript, deleteScript, listScripts, loadScript, newId, saveScript } from './storage';
import { AppearanceDialog } from './ui/AppearanceDialog';
import { TitlePageDialog } from './ui/TitlePageDialog';
import { useAppearance } from './ui/useAppearance';
import { DEFAULT_APPEARANCE, ZOOM_MAX, ZOOM_MIN } from './themes';

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
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const look = useAppearance();
  const workspaceRef = useRef<HTMLElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
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
  const showBreaks = look.settings.pageView !== 'draft';
  const starts = useMemo(() => (showBreaks ? pageStarts(dt, script.blocks) : []), [script.blocks, dt, showBreaks]);

  // "Fit" zoom: scale the 8.5in page (plus a little room) to the workspace width.
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el || look.settings.zoom !== 'fit' || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const z = (el.clientWidth - 48) / (8.5 * 96);
      setFitZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [look.settings.zoom]);
  const zoom = look.settings.zoom === 'fit' ? fitZoom : look.settings.zoom;

  // Ctrl/Cmd+Shift+L flips light and dark.
  const toggleRef = useRef(look.toggleMode);
  toggleRef.current = look.toggleMode;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    <div className={`app view-${look.settings.pageView}${look.settings.pageShadow ? '' : ' no-shadow'}${look.settings.pageNumbers ? '' : ' no-page-numbers'}`}>
      <style>{css}</style>
      <header className="topbar">
        <div className="brand">Scriptflow</div>
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
            <option value="native">Scriptflow file</option>
          </select>
        </label>
        <button className="icon-btn" onClick={look.toggleMode}
          title={`Switch to ${look.mode === 'dark' ? 'light' : 'dark'} mode (Ctrl/⌘+Shift+L)`}
          aria-label={`Switch to ${look.mode === 'dark' ? 'light' : 'dark'} mode`}>
          {look.mode === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button className="icon-btn" onClick={() => setAppearanceOpen(true)} title="Appearance" aria-label="Appearance settings">
          <PaletteIcon />
        </button>
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

      <main className="workspace" ref={workspaceRef}>
        <Editor
          key={id}
          docType={dt}
          initial={loaded}
          viewRef={viewRef}
          onChange={(blocks: Block[]) => persist({ ...script, blocks })}
          onElementChange={setElement}
          pageStarts={starts}
          zoom={zoom}
        />
      </main>

      <footer className="statusbar">
        <span>{getElement(dt, element || dt.firstElement).label}</span>
        <span>{sceneCount} {sceneCount === 1 ? 'scene' : 'scenes'}</span>
        <span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
        <button className="zoom-btn" onClick={() => setAppearanceOpen(true)} title="Zoom and appearance">{Math.round(zoom * 100)}%</button>
        <label><input type="checkbox" checked={sceneNumbers} onChange={(e) => setSceneNumbers(e.target.checked)} /> Scene numbers in PDF</label>
        <span className="saved">{saved ? 'Saved' : 'Saving…'}</span>
        <span className="keys">Enter: next element · Tab: change element · Shift+Enter: line break</span>
      </footer>

      {appearanceOpen && (
        <AppearanceDialog
          settings={look.settings}
          mode={look.mode}
          onChange={look.update}
          onReset={() => look.replace(DEFAULT_APPEARANCE)}
          onClose={() => setAppearanceOpen(false)}
        />
      )}

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

const icon = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
function SunIcon() {
  return <svg {...icon}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}
function MoonIcon() {
  return <svg {...icon}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
}
function PaletteIcon() {
  return <svg {...icon}><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22z" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="11" cy="7" r="1" /><circle cx="16" cy="8.5" r="1" /></svg>;
}
