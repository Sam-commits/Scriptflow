import { Fragment, Mark, Node as PMNode, Schema } from 'prosemirror-model';
import { Block, Run, Script, normalizeRuns } from '../model';

// One generic "element" node whose `type` attribute names the element in the
// current document type. That keeps the schema identical for every format.
export const schema = new Schema({
  nodes: {
    doc: { content: 'element+' },
    element: {
      attrs: { type: { default: 'action' } },
      content: 'inline*',
      marks: '_',
      parseDOM: [{ tag: 'p[data-type]', getAttrs: (d) => ({ type: (d as HTMLElement).dataset.type }) }],
      toDOM: (n) => ['p', { class: `el el-${n.attrs.type}`, 'data-type': n.attrs.type }, 0],
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
  },
});

export function blockToNode(b: Block): PMNode {
  const inline: PMNode[] = [];
  for (const r of b.runs) {
    const marks: Mark[] = [];
    if (r.bold) marks.push(schema.marks.bold.create());
    if (r.italic) marks.push(schema.marks.italic.create());
    if (r.underline) marks.push(schema.marks.underline.create());
    r.text.split('\n').forEach((part, i) => {
      if (i > 0) inline.push(schema.nodes.hard_break.create());
      if (part) inline.push(schema.text(part, marks));
    });
  }
  return schema.nodes.element.create({ type: b.type }, Fragment.from(inline));
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
    });
  });
  return { type: n.attrs.type, runs: normalizeRuns(runs) };
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
