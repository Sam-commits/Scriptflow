import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { AssistSettings } from '../assist/levels';
import { predict } from '../assist/predict';
import { matchSlash, slashCommands, slashQuery } from '../assist/slash';
import { DocTypeDef } from '../doctypes';
import { PageStart } from '../io/paginate';
import { Block, Script, TagItem } from '../model';
import { SavedStructure } from '../structures';
import { coachKey, coachPlugin, ghostKey, ghostPlugin, hintsPlugin } from './assistPlugins';
import { enterCommand, hardBreak, setElementType, tabCommand } from './commands';
import { docToBlocks, schema, scriptToDoc } from './schema';
import { pageBreakKey, pageBreakPlugin } from './pagebreaks';
import { getSuggestions } from './smarttype';
import { HashtagOption, hashtagOptions, hashtagQuery } from './hashtag';
import { TagCategory, lastCategory, tagColor, getCategory } from '../tags/categories';

interface PopupItem {
  text: string;
  suffix?: string;
  /** Second line, for "/" commands. */
  desc?: string;
  /** A "/" command id: accepting runs it instead of inserting text. */
  command?: string;
  /** A "#hashtag" choice: accepting tags the word instead of inserting text. */
  hashtag?: HashtagOption;
}

interface Popup {
  items: PopupItem[];
  index: number;
  from: number; // absolute doc positions of the text being replaced
  to: number;
  left: number;
  top: number;
}

interface Props {
  docType: DocTypeDef;
  initial: Script;
  onChange: (blocks: Block[]) => void;
  onElementChange: (type: string) => void;
  viewRef: MutableRefObject<EditorView | null>;
  /** Where printed pages 2..N begin, for on-screen page breaks. */
  pageStarts: PageStart[];
  /** Screen zoom (CSS zoom on the page); 1 = actual size. */
  zoom: number;
  /** Called after every transaction, for panels that follow the cursor. */
  onStateChange?: (state: EditorState) => void;
  /** Open the tag picker for the selection (Ctrl/⌘+Shift+E or the floating Tag button). */
  onTag?: () => void;
  /** Writing-assistant switches in force (level plus the Ghost switch). */
  assist: AssistSettings;
  /** Breakdown items, so tagged Cast and Locations join SmartType. */
  tags: TagItem[];
  /** Every tag type (built-in and custom), for the # menu. */
  tagTypes: TagCategory[];
  /** Scene templates the writer saved, for the "/" menu. */
  savedStructures: SavedStructure[];
  /** A "/" command was chosen on the empty element at `index`. */
  onCommand?: (id: string, index: number) => void;
  /** A "#hashtag" was accepted: create the element if needed and return its id. */
  onHashtag?: (option: HashtagOption) => string | null;
}

interface TagChip { left: number; top: number }

const SCENE_START_RE = /^(int|ext|est|i\/e|int\.?\/ext)\.\s/i;

export function Editor({
  docType, initial, onChange, onElementChange, viewRef, pageStarts, zoom, onStateChange, onTag, assist, tags, tagTypes, savedStructures, onCommand, onHashtag,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [chip, setChip] = useState<TagChip | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const dismissed = useRef(false);
  const cb = useRef({ onChange, onElementChange, onStateChange, onTag, onCommand, onHashtag });
  cb.current = { onChange, onElementChange, onStateChange, onTag, onCommand, onHashtag };
  const assistRef = useRef(assist);
  assistRef.current = assist;
  const dataRef = useRef({ tags, tagTypes, savedStructures });
  dataRef.current = { tags, tagTypes, savedStructures };
  const ghostTimer = useRef<number>();
  const ghostDismissed = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const show = (p: Popup | null) => { popupRef.current = p; setPopup(p); };

  const accept = (view: EditorView, item: PopupItem) => {
    const p = popupRef.current;
    if (!p) return;
    if (item.command) {
      const index = view.state.selection.$from.index(0);
      show(null);
      view.dispatch(view.state.tr.delete(p.from, p.to));
      cb.current.onCommand?.(item.command, index);
      return;
    }
    if (item.hashtag) {
      const o = item.hashtag;
      if (o.hint) return;
      if (o.pickType) {
        // "#" -> "#props:"; the menu stays open for the element name.
        dismissed.current = false;
        view.dispatch(view.state.tr.insertText(o.insert, p.from, p.to).scrollIntoView());
        view.focus();
        return;
      }
      const id = cb.current.onHashtag?.(o);
      show(null);
      const tr = view.state.tr.insertText(o.insert, p.from, p.to);
      if (id) tr.addMark(p.from, p.from + o.insert.length, schema.marks.tag.create({ id }));
      tr.setStoredMarks([]);
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return;
    }
    const tr = view.state.tr.insertText(item.text + (item.suffix ?? ''), p.from, p.to);
    view.dispatch(tr.scrollIntoView());
    view.focus();
  };

  const acceptGhost = (view: EditorView, words?: boolean) => {
    const g = ghostKey.getState(view.state);
    if (!g) return;
    const text = words ? /^\s*\S+/.exec(g.text)?.[0] ?? g.text : g.text;
    view.dispatch(view.state.tr.insertText(text, g.pos).scrollIntoView());
  };

  useEffect(() => {
    const dt = docType;
    const elementKeys: Record<string, ReturnType<typeof setElementType>> = {};
    dt.elements.forEach((e, i) => { if (i < 9) elementKeys[`Mod-${i + 1}`] = setElementType(e.id); });

    const smartKeys = new Plugin({
      props: {
        handleKeyDown(view, ev) {
          const p = popupRef.current;
          if (!p) return ghostKeys(view, ev);
          if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            const n = p.items.length;
            show({ ...p, index: (p.index + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n });
            return true;
          }
          if (ev.key === 'Enter' || ev.key === 'Tab') { accept(view, p.items[p.index]); return true; }
          if (ev.key === 'Escape') { dismissed.current = true; show(null); return true; }
          return false;
        },
      },
    });

    // Ghost text keys: Tab or → accepts it all, Ctrl/Alt+→ one word, Esc hides it.
    const ghostKeys = (view: EditorView, ev: KeyboardEvent) => {
      const g = ghostKey.getState(view.state);
      if (!g) return false;
      const key = assistRef.current.acceptKey;
      const plain = !ev.shiftKey && !ev.metaKey && !ev.ctrlKey && !ev.altKey;
      // On an empty line Tab keeps its job of changing the element; → accepts there.
      const emptyLine = view.state.selection.$from.parent.content.size === 0;
      if (ev.key === 'Tab' && plain && key !== 'right' && !emptyLine) { acceptGhost(view); return true; }
      if (ev.key === 'ArrowRight' && view.state.selection.empty && view.state.selection.from === g.pos) {
        if (plain && (key !== 'tab' || emptyLine)) { acceptGhost(view); return true; }
        if ((ev.ctrlKey || ev.altKey) && !ev.shiftKey && !ev.metaKey) { acceptGhost(view, true); return true; }
      }
      if (ev.key === 'Escape') {
        ghostDismissed.current = true;
        view.dispatch(view.state.tr.setMeta(ghostKey, null));
        return true;
      }
      return false;
    };

    // Typing "INT. " or "EXT. " at the start of an Action turns it into a Scene Heading.
    const autoDetect = new Plugin({
      appendTransaction(trs, _old, state) {
        if (!trs.some((t) => t.docChanged)) return null;
        if (!dt.elements.some((e) => e.id === 'scene_heading')) return null;
        const $from = state.selection.$from;
        const node = $from.parent;
        if (node.attrs.type === 'action' && SCENE_START_RE.test(node.textContent) && !node.textContent.includes('\n')) {
          return state.tr.setNodeMarkup($from.before(), undefined, { type: 'scene_heading' });
        }
        return null;
      },
    });

    const state = EditorState.create({
      doc: scriptToDoc(initial, dt.firstElement),
      plugins: [
        smartKeys,
        autoDetect,
        pageBreakPlugin(),
        ghostPlugin(),
        hintsPlugin(dt, () => assistRef.current),
        coachPlugin(dt, () => assistRef.current),
        history(),
        keymap({
          Enter: enterCommand(dt),
          'Shift-Enter': hardBreak,
          Tab: tabCommand(dt),
          'Shift-Tab': tabCommand(dt, true),
          'Mod-b': toggleMark(schema.marks.bold),
          'Mod-i': toggleMark(schema.marks.italic),
          'Mod-u': toggleMark(schema.marks.underline),
          'Mod-z': undo,
          'Mod-Shift-z': redo,
          'Mod-y': redo,
          'Mod-Shift-e': () => { cb.current.onTag?.(); return true; },
          ...elementKeys,
        }),
        keymap(baseKeymap),
      ],
    });

    const place = (view: EditorView, from: number) => {
      const coords = view.coordsAtPos(from);
      const box = host.current!.getBoundingClientRect();
      // Screen coordinates are zoomed; the popup is positioned inside the zoomed host.
      const z = zoomRef.current || 1;
      return { left: (coords.left - box.left) / z, top: (coords.bottom - box.top) / z + 2 };
    };

    const updateSmart = (view: EditorView) => {
      const { selection, doc } = view.state;
      const $from = selection.$from;
      if (!selection.empty || dismissed.current) { show(null); return; }
      const node = $from.parent;
      const before = node.textBetween(0, $from.parentOffset, '\n');
      const after = node.textBetween($from.parentOffset, node.content.size, '\n');
      const s = assistRef.current;
      let items: PopupItem[] = [];
      let from = 0;

      // "#word" offers to tag the word (always on, whatever the assistant level).
      const hash = hashtagQuery(before);
      const q = s.sceneBuilder && !after ? slashQuery(before) : null;
      if (hash) {
        items = hashtagOptions(hash, dataRef.current.tags, dataRef.current.tagTypes, lastCategory())
          .map((o) => ({ text: o.label, desc: o.desc, hashtag: o }));
        from = $from.start() + hash.from;
      } else if (q !== null) {
        items = matchSlash(slashCommands(dt.id, dataRef.current.savedStructures), q)
          .map((c) => ({ text: c.label, desc: c.desc, command: c.id }));
        from = $from.start();
      } else if (s.smartType) {
        const blocks = docToBlocks(doc);
        const sug = getSuggestions({
          dt, blocks, index: $from.index(0), before, tags: dataRef.current.tags,
          max: s.smartTypeMax, eager: s.smartTypeEager, nextSpeaker: s.nextSpeaker,
        });
        if (sug) { items = sug.items; from = $from.start() + sug.from; }
      }
      if (!items.length) { show(null); return; }
      const prev = popupRef.current;
      const same = prev && prev.items.map((i) => i.text).join() === items.map((i) => i.text).join();
      show({ items, index: same ? prev!.index : 0, from, to: selection.from, ...place(view, from) });
    };

    // Ghost text appears after a pause, only at the end of an element and never with the dropdown open.
    const scheduleGhost = (view: EditorView) => {
      window.clearTimeout(ghostTimer.current);
      const s = assistRef.current;
      if (!s.ghostStructure && !s.ghostPhrases && s.nextSpeaker !== 'ghost') return;
      if (ghostDismissed.current || popupRef.current) return;
      ghostTimer.current = window.setTimeout(() => {
        if (view.isDestroyed || popupRef.current || !view.hasFocus()) return;
        const { selection, doc } = view.state;
        if (!selection.empty) return;
        const $from = selection.$from;
        const node = $from.parent;
        const text = predict({
          dt, blocks: docToBlocks(doc), index: $from.index(0),
          before: node.textBetween(0, $from.parentOffset, '\n'),
          after: node.textBetween($from.parentOffset, node.content.size, '\n'),
          settings: assistRef.current, tags: dataRef.current.tags,
        });
        if (text) view.dispatch(view.state.tr.setMeta(ghostKey, { pos: selection.from, text }).setMeta('addToHistory', false));
      }, s.ghostDelay);
    };

    // A small "Tag" button follows a text selection.
    const updateChip = (view: EditorView) => {
      const { selection } = view.state;
      if (selection.empty || !cb.current.onTag || !view.hasFocus()) { setChip(null); return; }
      const end = view.coordsAtPos(selection.to);
      const box = host.current!.getBoundingClientRect();
      const z = zoomRef.current || 1;
      setChip({ left: (end.right - box.left) / z + 6, top: (end.top - box.top) / z - 30 });
    };

    const view = new EditorView(host.current!, {
      state,
      dispatchTransaction(tr) {
        const prevType = view.state.selection.$from.parent.attrs.type;
        const next = view.state.apply(tr);
        view.updateState(next);
        // Showing or hiding ghost text changes nothing else.
        if (tr.getMeta(ghostKey) !== undefined && !tr.docChanged && !tr.selectionSet) return;
        if (tr.docChanged) { dismissed.current = false; ghostDismissed.current = false; cb.current.onChange(docToBlocks(next.doc)); }
        const type = next.selection.$from.parent.attrs.type;
        if (type !== prevType || tr.docChanged || tr.selectionSet) cb.current.onElementChange(type);
        updateSmart(view);
        scheduleGhost(view);
        updateChip(view);
        cb.current.onStateChange?.(next);
      },
      handleDOMEvents: {
        blur: () => {
          window.clearTimeout(ghostTimer.current);
          setTimeout(() => {
            show(null);
            if (!view.hasFocus()) {
              setChip(null);
              if (ghostKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(ghostKey, null));
            }
          }, 150);
          return false;
        },
        focus: () => { updateChip(view); return false; },
      },
    });
    viewRef.current = view;
    // Put the cursor at the end of the script.
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    return () => { window.clearTimeout(ghostTimer.current); view.destroy(); viewRef.current = null; };
    // The editor is recreated per script via a React key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings changed: hide the dropdown and ghost text, and redraw hints and coach marks.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    show(null);
    view.dispatch(view.state.tr.setMeta(ghostKey, null).setMeta(coachKey, true).setMeta('addToHistory', false));
  }, [assist, viewRef]);

  // Redraw page breaks whenever the layout changes.
  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch(view.state.tr.setMeta(pageBreakKey, pageStarts).setMeta('addToHistory', false));
  }, [pageStarts, viewRef]);

  return (
    <div className="editor-host" style={{ zoom }}>
      <div ref={host} className={`page dt-${docType.id}`} />
      {popup && (
        <ul className={`smarttype${popup.items[0]?.command ? ' slash' : ''}${popup.items[0]?.hashtag ? ' slash hashtag' : ''}`} style={{ left: popup.left, top: popup.top }} role="listbox">
          {popup.items.map((it, i) => (
            <li
              key={it.command ?? (it.hashtag ? `${it.hashtag.pickType ? "type" : it.hashtag.itemId ?? "new"}:${it.hashtag.category}` : it.text)}
              ref={i === popup.index ? (el) => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
              role="option"
              aria-selected={i === popup.index}
              className={`${i === popup.index ? 'active' : ''}${it.hashtag?.hint ? ' hint-row' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); if (viewRef.current) accept(viewRef.current, it); }}
            >
              {it.hashtag && <span className="dot" style={{ background: it.hashtag.hint ? 'transparent' : tagColor(getCategory(it.hashtag.category, tagTypes), '-ui') }} />}
              {it.text}
              {it.desc && <small>{it.desc}</small>}
            </li>
          ))}
        </ul>
      )}
      {chip && !popup && (
        <button
          type="button" className="tag-chip" style={{ left: chip.left, top: chip.top }}
          title="Tag this text (Ctrl/⌘+Shift+E)"
          onMouseDown={(e) => { e.preventDefault(); cb.current.onTag?.(); }}
        >Tag</button>
      )}
    </div>
  );
}

/** CSS for one document type's page layout, generated from its element defs. */
export function docTypeCss(dt: DocTypeDef): string {
  const LINE = 12; // pt
  return dt.elements.map((e) => {
    const rules = [
      `margin-left:${e.left}in`, `width:${e.width}in`, `margin-top:${e.spaceBefore * LINE}pt`,
      `text-align:${e.align ?? 'left'}`,
      e.uppercase && 'text-transform:uppercase',
      e.italic && 'font-style:italic', e.bold && 'font-weight:bold',
      e.underline && 'text-decoration:underline',
    ].filter(Boolean).join(';');
    const sep = e.pageBreakBefore
      ? `.dt-${dt.id} .ProseMirror > .el-${e.id}:not(:first-child){border-top:1px dashed var(--page-rule);padding-top:${LINE}pt;margin-top:${2 * LINE}pt}`
      : '';
    return `.dt-${dt.id} .ProseMirror > .el-${e.id}{--el-left:${e.left}in;${rules}}${sep}`;
  }).join('\n');
}

