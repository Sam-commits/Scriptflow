import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { DocTypeDef } from '../doctypes';
import { PageStart } from '../io/paginate';
import { Block, Script } from '../model';
import { enterCommand, hardBreak, setElementType, tabCommand } from './commands';
import { docToBlocks, nodeToBlock, schema, scriptToDoc } from './schema';
import { pageBreakKey, pageBreakPlugin } from './pagebreaks';
import { getSuggestions } from './smarttype';

interface Popup {
  items: string[];
  index: number;
  from: number; // absolute doc positions of the text being replaced
  to: number;
  suffix: string;
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
}

interface TagChip { left: number; top: number }

const SCENE_START_RE = /^(int|ext|est|i\/e|int\.?\/ext)\.\s/i;

export function Editor({ docType, initial, onChange, onElementChange, viewRef, pageStarts, zoom, onStateChange, onTag }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [chip, setChip] = useState<TagChip | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const dismissed = useRef(false);
  const cb = useRef({ onChange, onElementChange, onStateChange, onTag });
  cb.current = { onChange, onElementChange, onStateChange, onTag };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const show = (p: Popup | null) => { popupRef.current = p; setPopup(p); };

  const accept = (view: EditorView, item: string) => {
    const p = popupRef.current;
    if (!p) return;
    const tr = view.state.tr.insertText(item + p.suffix, p.from, p.to);
    view.dispatch(tr.scrollIntoView());
    view.focus();
  };

  useEffect(() => {
    const dt = docType;
    const elementKeys: Record<string, ReturnType<typeof setElementType>> = {};
    dt.elements.forEach((e, i) => { if (i < 9) elementKeys[`Mod-${i + 1}`] = setElementType(e.id); });

    const smartKeys = new Plugin({
      props: {
        handleKeyDown(view, ev) {
          const p = popupRef.current;
          if (!p) return false;
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

    const updateSmart = (view: EditorView) => {
      const { selection, doc } = view.state;
      const $from = selection.$from;
      if (!selection.empty) { show(null); return; }
      const node = $from.parent;
      const before = node.textBetween(0, $from.parentOffset, '\n');
      const index = $from.index(0);
      const others: Block[] = [];
      doc.forEach((n, _o, i) => { if (i !== index) others.push(nodeToBlock(n)); });
      const s = dismissed.current ? null : getSuggestions(dt, node.attrs.type, before, others);
      if (!s) { show(null); return; }
      const from = $from.start() + s.from;
      const coords = view.coordsAtPos(from);
      const box = host.current!.getBoundingClientRect();
      // Screen coordinates are zoomed; the popup is positioned inside the zoomed host.
      const z = zoomRef.current || 1;
      const prev = popupRef.current;
      const same = prev && prev.items.join() === s.items.join();
      show({
        items: s.items, index: same ? prev!.index : 0, from, to: selection.from, suffix: s.suffix,
        left: (coords.left - box.left) / z, top: (coords.bottom - box.top) / z + 2,
      });
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
        if (tr.docChanged) { dismissed.current = false; cb.current.onChange(docToBlocks(next.doc)); }
        const type = next.selection.$from.parent.attrs.type;
        if (type !== prevType || tr.docChanged || tr.selectionSet) cb.current.onElementChange(type);
        updateSmart(view);
        updateChip(view);
        cb.current.onStateChange?.(next);
      },
      handleDOMEvents: {
        blur: () => { setTimeout(() => { show(null); if (!view.hasFocus()) setChip(null); }, 150); return false; },
        focus: () => { updateChip(view); return false; },
      },
    });
    viewRef.current = view;
    // Put the cursor at the end of the script.
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    return () => { view.destroy(); viewRef.current = null; };
    // The editor is recreated per script via a React key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw page breaks whenever the layout changes.
  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch(view.state.tr.setMeta(pageBreakKey, pageStarts).setMeta('addToHistory', false));
  }, [pageStarts, viewRef]);

  return (
    <div className="editor-host" style={{ zoom }}>
      <div ref={host} className={`page dt-${docType.id}`} />
      {popup && (
        <ul className="smarttype" style={{ left: popup.left, top: popup.top }} role="listbox">
          {popup.items.map((it, i) => (
            <li
              key={it}
              role="option"
              aria-selected={i === popup.index}
              className={i === popup.index ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); if (viewRef.current) accept(viewRef.current, it); }}
            >{it}</li>
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
    return `.dt-${dt.id} .ProseMirror > .el-${e.id}{${rules}}${sep}`;
  }).join('\n');
}

