import { Fragment, Mark, Node as PMNode, Schema } from 'prosemirror-model';
import { Block, Run, Script, normalizeRuns } from '../model';

// One generic "element" node whose `type` attribute names the element in the
// current document type. That keeps the schema identical for every format.
export const schema = new Schema({
  nodes: {
    doc: { content: 'element+' },
    element: {
      // `tags`: tag item ids attached to the whole element (scene-level tags).
      attrs: { type: { default: 'action' }, tags: { default: null } },
      content: 'inline*',
      marks: '_',
      parseDOM: [{
        tag: 'p[data-type]',
        getAttrs: (d) => {
          const el = d as HTMLElement;
          return { type: el.dataset.type, tags: el.dataset.tags ? el.dataset.tags.split(' ') : null };
        },
      }],
      toDOM: (n) => ['p', {
        class: `el el-${n.attrs.type}`, 'data-type': n.attrs.type,
        ...(n.attrs.tags?.length && { 'data-tags': n.attrs.tags.join(' ') }),
      }, 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true, group: 'inline', selectable: false,
      parseDOM: [{ tag: 'br' }], toDOM: () => ['br'],
    },
  },
  marks: {
    bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    underline: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
    // A breakdown tag. `excludes: ''` lets one stretch of text carry several
    // tags (e.g. "her father's watch" as both a prop and wardrobe).
    tag: {
      attrs: { id: {} },
      excludes: '',
      inclusive: false,
      parseDOM: [{ tag: 'span[data-tag]', getAttrs: (d) => ({ id: (d as HTMLElement).dataset.tag }) }],
      toDOM: (m) => ['span', { class: 'tag', 'data-tag': m.attrs.id }, 0],
    },
  },
});

export function blockToNode(b: Block): PMNode {
  const inline: PMNode[] = [];
  for (const r of b.runs) {
    const marks: Mark[] = [];
    if (r.bold) marks.push(schema.marks.bold.create());
    if (r.italic) marks.push(schema.marks.italic.create());
    if (r.underline) marks.push(schema.marks.underline.create());
    for (const id of r.tags ?? []) marks.push(schema.marks.tag.create({ id }));
    r.text.split('\n').forEach((part, i) => {
      if (i > 0) inline.push(schema.nodes.hard_break.create());
      if (part) inline.push(schema.text(part, marks));
    });
  }
  return schema.nodes.element.create({ type: b.type, tags: b.tags?.length ? b.tags : null }, Fragment.from(inline));
}

export function nodeToBlock(n: PMNode): Block {
  const runs: Run[] = [];
  n.forEach((child) => {
    if (child.type.name === 'hard_break') { runs.push({ text: '\n' }); return; }
    const has = (m: string) => child.marks.some((x) => x.type.name === m);
    runs.push({
      text: child.text ?? '',
      ...(has('bold') && { bold: true }),
      ...(has('italic') && { italic: true }),
      ...(has('underline') && { underline: true }),
      ...(child.marks.some((x) => x.type.name === 'tag') && {
        tags: child.marks.filter((x) => x.type.name === 'tag').map((x) => x.attrs.id as string),
      }),
    });
  });
  const block: Block = { type: n.attrs.type, runs: normalizeRuns(runs) };
  if (n.attrs.tags?.length) block.tags = [...n.attrs.tags];
  return block;
}

export function scriptToDoc(script: Script, firstElement: string): PMNode {
  const blocks = script.blocks.length ? script.blocks : [{ type: firstElement, runs: [] }];
  return schema.nodes.doc.create(null, blocks.map(blockToNode));
}

export function docToBlocks(doc: PMNode): Block[] {
  const out: Block[] = [];
  doc.forEach((n) => out.push(nodeToBlock(n)));
  return out;
}
