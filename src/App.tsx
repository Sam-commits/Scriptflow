import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { docTypeList, getDocType, getElement } from './doctypes';
import { Editor, docTypeCss } from './editor/Editor';
import { setElementType } from './editor/commands';
import {
  Range, addTag, autoTagCharacters, findMentions, mentionFilter, mergeTag, removeTagEverywhere, removeTagHere,
  selectionOrWord, setSceneTag, tagRanges, tagsAtSelection,
} from './editor/tagging';
import { download, NATIVE_EXT, parseFile, safeName, toFdx, toFountain } from './io/files';
import { paginate, pageStarts } from './io/paginate';
import { scriptToPdf } from './io/pdf';
import { Block, Script, TagItem, TitlePage, blockText } from './model';
import { sampleScreenplay } from './sample';
import { ScriptMeta, blankScript, deleteScript, listScripts, loadScript, newId, saveScript } from './storage';
import { breakdownCsv, findItem } from './tags/breakdown';
import { AppearanceDialog } from './ui/AppearanceDialog';
import { BreakdownPanel } from './ui/BreakdownPanel';
import { TagDialog, TagRequest, lastCategory } from './ui/TagDialog';
import { TitlePageDialog } from './ui/TitlePageDialog';
import { useAppearance } from './ui/useAppearance';
import { DEFAULT_APPEARANCE, ZOOM_MAX, ZOOM_MIN } from './themes';
import { levelName } from './assist/levels';
import { checkFormat, visibleIssues } from './assist/coach';
import { renameCharacter, renameLocation } from './assist/rename';
import { replaceElementWith } from './editor/commands';
import { sceneStartIndex } from './editor/smarttype';
import { SavedStructure, layoutOf, loadSaved, saveSaved } from './structures';
import { AssistDialog } from './ui/AssistDialog';
import { LevelPicker } from './ui/LevelPicker';
import { NamesDialog } from './ui/NamesDialog';
import { SceneBuilder } from './ui/SceneBuilder';
import { Walkthrough } from './ui/Walkthrough';
import { useAssist } from './ui/useAssist';

const LAST = 'scriptflow:last';
const PANEL = 'scriptflow:breakdown-open';

interface PendingTag { range: Range; text: string; others: Range[] }

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
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const [pendingTag, setPendingTag] = useState<PendingTag | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => { try { return localStorage.getItem(PANEL) === '1'; } catch { return false; } });
  const [cursor, setCursor] = useState<{ index: number; tags: string[]; empty: boolean; atEnd: boolean }>({ index: 0, tags: [], empty: false, atEnd: true });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [library, setLibrary] = useState<ScriptMeta[]>(listScripts);
  const [element, setElement] = useState('');
  const [titleOpen, setTitleOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const look = useAppearance();
  const assist = useAssist();
  const [assistOpen, setAssistOpen] = useState(false);
  const [names, setNames] = useState<null | 'list' | 'add'>(null);
  const [builder, setBuilder] = useState<{ index: number; structure?: string } | null>(null);
  const [tour, setTour] = useState(false);
  const [savedStructures, setSavedStructures] = useState<SavedStructure[]>(loadSaved);
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

  /** Update the script; pass a function to build on the latest version (several updates can land in one event). */
  const persist = (update: Script | ((s: Script) => Script)) => {
    const next = typeof update === 'function' ? update(scriptRef.current) : update;
    scriptRef.current = next;
    setScript(next);
    setSaved(false);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveScript(id, next); setSaved(true); setLibrary(listScripts());
    }, 400);
  };

  const flush = () => {
    window.clearTimeout(saveTimer.current);
    saveScript(id, scriptRef.current); setSaved(true);
  };

  const open = (nid: string, s: Script) => {
    flush();
    setCurrent({ id: nid, script: s });
    scriptRef.current = s;
    setScript(s);
    setLibrary(listScripts());
    setFocusId(null);
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
      if (r && s) { setCurrent({ id: r.id, script: s }); scriptRef.current = s; setScript(s); }
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

  // Ctrl/Cmd+Shift+L flips light and dark; Ctrl/Cmd+Shift+G turns ghost text on and off.
  const toggleRef = useRef({ mode: look.toggleMode, ghost: assist.toggleGhost });
  toggleRef.current = { mode: look.toggleMode, ghost: assist.toggleGhost };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() === 'l') { e.preventDefault(); toggleRef.current.mode(); }
      if (e.key.toLowerCase() === 'g') { e.preventDefault(); toggleRef.current.ghost(); }
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

  // ---- Tagging -------------------------------------------------------------
  const items = script.tags ?? [];
  const setItems = (next: TagItem[]) => persist((s) => ({ ...s, tags: next }));

  const openTagDialog = () => {
    const view = viewRef.current;
    if (!view) return;
    const range = selectionOrWord(view.state);
    if (!range) { setError('Select the words you want to tag first.'); return; }
    const text = view.state.doc.textBetween(range.from, range.to, ' ', ' ');
    const others = findMentions(view.state.doc, text, mentionFilter(dt)).filter((r) => r.to <= range.from || r.from >= range.to);
    setPendingTag({ range, text, others });
  };

  const applyTag = (req: TagRequest) => {
    const view = viewRef.current;
    const pending = pendingTag;
    setPendingTag(null);
    if (!view || !pending) return;
    let item = findItem(items, req.category, req.name);
    if (!item) {
      item = { id: newId(), category: req.category, name: req.name, ...(req.notes && { notes: req.notes }) };
      setItems([...items, item]);
    }
    const ranges = req.everywhere ? [pending.range, ...pending.others] : [pending.range];
    const tr = addTag(view.state.tr, ranges, item.id);
    tr.setSelection(TextSelection.create(tr.doc, pending.range.to));
    view.dispatch(tr);
    view.focus();
  };

  const onEditorState = (state: EditorState) => {
    const $from = state.selection.$from;
    const index = $from.index(0);
    const tags = tagsAtSelection(state);
    const empty = $from.parent.content.size === 0;
    const atEnd = $from.parentOffset === $from.parent.content.size;
    setCursor((c) => (c.index === index && c.tags.join() === tags.join() && c.empty === empty && c.atEnd === atEnd
      ? c : { index, tags, empty, atEnd }));
  };

  const dispatchTag = (make: (state: EditorState) => ReturnType<EditorState['tr']['addMark']> | null) => {
    const view = viewRef.current;
    if (!view) return;
    const tr = make(view.state);
    if (tr) view.dispatch(tr);
  };

  /** Select the next use of an item after the cursor, optionally only inside blocks [start, end). */
  const findNext = (tagId: string, within?: [number, number]) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    let lo = 0, hi = doc.content.size;
    if (within) {
      doc.forEach((n, off, i) => { if (i === within[0]) lo = off; if (i === within[1] - 1) hi = off + n.nodeSize; });
    }
    const all = tagRanges(doc, tagId).filter((r) => r.from >= lo && r.to <= hi);
    if (!all.length) return;
    const cur = view.state.selection.from;
    const next = all.find((r) => r.from > cur) ?? all[0];
    setFocusId(tagId);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, next.from, next.to)).scrollIntoView());
    view.focus();
    (view.domAtPos(next.from).node as HTMLElement).parentElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  const addSceneTag = (sceneStart: number, category: string, name: string) => {
    let item = findItem(items, category, name);
    if (!item) {
      item = { id: newId(), category, name: category === 'cast' ? name.toUpperCase() : name };
      setItems([...items, item]);
    }
    const tagId = item.id;
    dispatchTag((st) => setSceneTag(st, sceneStart, tagId, true));
  };

  const updateItem = (itemId: string, patch: Partial<TagItem>) => {
    const cur = items.find((i) => i.id === itemId);
    if (!cur) return;
    const next = { ...cur, ...patch };
    const clash = findItem(items.filter((i) => i.id !== itemId), next.category, next.name);
    if (clash) {
      // Renamed into an element that already exists: move its tags over.
      setItems(items.filter((i) => i.id !== itemId));
      dispatchTag((st) => mergeTag(st, itemId, clash.id));
    } else {
      setItems(items.map((i) => (i.id === itemId ? next : i)));
    }
  };

  const deleteItem = (itemId: string) => {
    setItems(items.filter((i) => i.id !== itemId));
    dispatchTag((st) => removeTagEverywhere(st, itemId));
    if (focusId === itemId) setFocusId(null);
  };

  const autoCast = () => {
    const view = viewRef.current;
    if (!view) return;
    const { tr, items: next } = autoTagCharacters(view.state, dt, items, newId);
    setItems(next);
    view.dispatch(tr);
  };

  const togglePanel = (open = !panelOpen) => {
    setPanelOpen(open);
    try { localStorage.setItem(PANEL, open ? '1' : '0'); } catch { /* ignore */ }
  };

  // Each tag item takes its category's theme colors.
  const tagStyle = useMemo(() => items.map((i) => {
    const sel = `.tags-on .page [data-tag="${CSS.escape(i.id)}"]`;
    return `${sel}{--tc:var(--tag-${i.category});--tc-soft:var(--tag-${i.category}-soft);--tc-ui:var(--tag-${i.category}-ui);--tc-ui-soft:var(--tag-${i.category}-ui-soft)}`;
  }).join('\n') + (focusId ? `\n.tags-on .page [data-tag="${CSS.escape(focusId)}"]{outline:2px solid var(--tc);outline-offset:1px;border-radius:2px}` : ''),
  [items, focusId]);

  // ---- Writing assistant ----------------------------------------------------
  const onCommand = (cmd: string, index: number) => {
    if (cmd === 'character') { setNames('add'); return; }
    if (cmd === 'names') { setNames('list'); return; }
    setBuilder({ index, structure: cmd.startsWith('scene:') ? cmd.slice(6) : undefined });
  };

  const insertScene = (blocks: Block[]) => {
    const view = viewRef.current;
    const at = builder;
    setBuilder(null);
    if (!view || !at) return;
    const tr = replaceElementWith(view.state, at.index, blocks);
    if (tr) view.dispatch(tr);
    view.focus();
  };

  /** The scene above the "/" line: what "save as template" saves. */
  const sceneAbove = (index: number): Block[] => {
    if (index <= 0) return [];
    const start = sceneStartIndex(dt, script.blocks, index - 1);
    if (!getElement(dt, script.blocks[start]?.type ?? '').sceneStart) return [];
    return script.blocks.slice(start, index).filter((b) => blockText(b).trim() || b.hint);
  };

  const saveLayout = (name: string) => {
    if (!builder) return;
    const steps = layoutOf(sceneAbove(builder.index), (t) => !!getElement(dt, t).speaker);
    if (!steps.length) return;
    const next = [...savedStructures.filter((x) => !(x.docType === dt.id && x.name.toLowerCase() === name.toLowerCase())),
      { id: newId(), name, docType: dt.id, steps }];
    setSavedStructures(next);
    saveSaved(next);
  };

  const addNamedItem = (category: string, name: string) => {
    const n = name.toUpperCase();
    if (!findItem(items, category, n)) setItems([...items, { id: newId(), category, name: n }]);
  };

  const onRenameCharacter = (from: string, to: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(renameCharacter(view.state, dt, from, to));
    const item = findItem(items, 'cast', from);
    if (item) updateItem(item.id, { name: to.toUpperCase() });
  };

  const onRenameLocation = (path: string[], to: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(renameLocation(view.state, dt, path, to));
    const item = findItem(items, 'locations', path[path.length - 1]);
    if (item) updateItem(item.id, { name: to.toUpperCase() });
  };

  const startTour = () => {
    setAssistOpen(false);
    const nid = newId();
    const s = blankScript('screenplay');
    s.titlePage.title = 'My First Scene';
    saveScript(nid, s);
    open(nid, s);
    setTour(true);
  };

  const openExample = () => {
    setAssistOpen(false);
    const nid = newId();
    saveScript(nid, sampleScreenplay);
    open(nid, sampleScreenplay);
  };

  const issues = useMemo(
    () => visibleIssues(checkFormat(dt, script.blocks), assist.settings.formatCoach),
    [dt, script.blocks, assist.settings.formatCoach],
  );
  const tipHere = issues.find((x) => x.index === cursor.index);

  /** The status-bar element guide: what this element is and what Enter and Tab do next. */
  const guide = (() => {
    const el = getElement(dt, element || dt.firstElement);
    const mode = assist.settings.elementGuide;
    if (mode !== 'full') return null;
    const label = (id?: string) => (id ? getElement(dt, id).label : '');
    let enter: string;
    let tab: string;
    if (cursor.empty) {
      enter = el.next !== el.id ? `Enter: turn into ${label(el.next)}` : `Enter: new ${label(el.next)}`;
      tab = el.tab ? `Tab: change to ${label(el.tab)}` : '';
    } else if (cursor.atEnd) {
      enter = `Enter: new ${label(el.next)}`;
      tab = el.tab ? `Tab: new ${label(el.tab)}` : '';
    } else {
      enter = 'Enter: split the line';
      tab = '';
    }
    return { what: el.help ? `${el.label}: ${el.help}` : el.label, keys: [enter, tab].filter(Boolean).join(' · ') };
  })();

  const exportAs = (kind: string) => {
    flush();
    const name = safeName(script);
    if (kind === 'pdf') scriptToPdf(script, { sceneNumbers }).save(`${name}.pdf`);
    if (kind === 'fountain') download(`${name}.fountain`, toFountain(script));
    if (kind === 'fdx') download(`${name}.fdx`, toFdx(script), 'application/xml');
    if (kind === 'csv') download(`${name} breakdown.csv`, breakdownCsv(dt, scriptRef.current), 'text/csv');
    if (kind === 'native') download(`${name}${NATIVE_EXT}`, JSON.stringify(script, null, 2), 'application/json');
  };

  return (
    <div className={`app view-${look.settings.pageView}${look.settings.pageShadow ? '' : ' no-shadow'}${look.settings.pageNumbers ? '' : ' no-page-numbers'}${look.settings.showTags ? ' tags-on' : ''}${panelOpen ? ' with-panel' : ''}${assist.settings.elementGuide !== 'off' ? ' notes-on' : ''}`}>
      <style>{css}</style>
      <style>{tagStyle}</style>
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
        <button onMouseDown={(e) => e.preventDefault()} onClick={openTagDialog} title="Tag the selected text as a prop, character, location, shot… (Ctrl/⌘+Shift+E)">Tag</button>
        <button className={panelOpen ? 'on' : ''} aria-pressed={panelOpen} onClick={() => togglePanel()} title="Breakdown of tagged elements">Breakdown</button>
        <button onClick={() => setAssistOpen(true)} title="Writing assistant level and settings">
          Assist: {levelName(assist.config)}
        </button>
        <button className={assist.ghost ? 'on' : ''} aria-pressed={assist.ghost} onMouseDown={(e) => e.preventDefault()}
          onClick={assist.toggleGhost} title="Ghost text: predicted next words in grey (Ctrl/⌘+Shift+G)">
          Ghost text {assist.ghost ? 'on' : 'off'}
        </button>
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
            <option value="csv" disabled={!items.length}>Breakdown (.csv)</option>
            <option value="native">Right Write Wright file (.scriptflow)</option>
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
          onChange={(blocks: Block[]) => persist((s) => ({ ...s, blocks }))}
          onElementChange={setElement}
          onStateChange={onEditorState}
          onTag={openTagDialog}
          pageStarts={starts}
          zoom={zoom}
          assist={assist.settings}
          tags={items}
          savedStructures={savedStructures}
          onCommand={onCommand}
        />
      </main>

      {panelOpen && (
        <BreakdownPanel
          dt={dt}
          blocks={script.blocks}
          items={items}
          cursorIndex={cursor.index}
          cursorTags={cursor.tags}
          showTags={look.settings.showTags}
          focusId={focusId}
          onShowTags={(on) => look.update({ showTags: on })}
          onFind={findNext}
          onRemoveHere={(tid) => dispatchTag((st) => removeTagHere(st, tid))}
          onSceneTag={addSceneTag}
          onRemoveSceneTag={(start, tid) => dispatchTag((st) => setSceneTag(st, start, tid, false))}
          onUpdateItem={updateItem}
          onDeleteItem={deleteItem}
          onAutoCast={autoCast}
          onExportCsv={() => exportAs('csv')}
          onClose={() => togglePanel(false)}
        />
      )}

      {pendingTag && (
        <TagDialog
          text={pendingTag.text}
          otherMentions={pendingTag.others.length}
          items={items}
          initialCategory={lastCategory()}
          onTag={applyTag}
          onClose={() => { setPendingTag(null); viewRef.current?.focus(); }}
        />
      )}

      <footer className="statusbar">
        {guide ? (
          <span className="guide"><b>{guide.what}</b> <span>{guide.keys}</span></span>
        ) : (
          <span>{getElement(dt, element || dt.firstElement).label}</span>
        )}
        {tipHere && <span className={`coach-tip${tipHere.serious ? ' serious' : ''}`} title={tipHere.message}>Tip: {tipHere.message}</span>}
        <span>{sceneCount} {sceneCount === 1 ? 'scene' : 'scenes'}</span>
        <span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
        <button className="zoom-btn" onClick={() => setAppearanceOpen(true)} title="Zoom and appearance">{Math.round(zoom * 100)}%</button>
        <label><input type="checkbox" checked={sceneNumbers} onChange={(e) => setSceneNumbers(e.target.checked)} /> Scene numbers in PDF</label>
        <span className="saved">{saved ? 'Saved' : 'Saving…'}</span>
        {assist.settings.elementGuide === 'name' && <span className="keys">Enter: next element · Tab: change element · Shift+Enter: line break</span>}
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

      {assistOpen && (
        <AssistDialog
          config={assist.config}
          onChange={assist.setConfig}
          onNames={() => { setAssistOpen(false); setNames('list'); }}
          onTour={startTour}
          onExample={openExample}
          onClose={() => setAssistOpen(false)}
        />
      )}

      {names && (
        <NamesDialog
          dt={dt}
          blocks={script.blocks}
          tags={items}
          focusAdd={names === 'add'}
          onRenameCharacter={onRenameCharacter}
          onRenameLocation={onRenameLocation}
          onAddCharacter={(n) => addNamedItem('cast', n)}
          onAddLocation={(n) => addNamedItem('locations', n)}
          onClose={() => { setNames(null); viewRef.current?.focus(); }}
        />
      )}

      {builder && (
        <SceneBuilder
          dt={dt}
          blocks={script.blocks}
          index={builder.index}
          tags={items}
          settings={assist.settings}
          saved={savedStructures}
          initialStructure={builder.structure}
          canSaveLayout={sceneAbove(builder.index).length > 1}
          onInsert={insertScene}
          onSaveLayout={saveLayout}
          onClose={() => { setBuilder(null); viewRef.current?.focus(); }}
        />
      )}

      {tour && <Walkthrough dt={dt} blocks={script.blocks} onClose={() => setTour(false)} />}

      {!assist.config.chosen && (
        <LevelPicker onPick={(level, withTour) => { assist.setLevel(level); if (withTour) startTour(); }} />
      )}

      {titleOpen && (
        <TitlePageDialog
          value={script.titlePage}
          onClose={() => setTitleOpen(false)}
          onSave={(tp: TitlePage) => { persist((s) => ({ ...s, titlePage: tp })); setTitleOpen(false); }}
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
