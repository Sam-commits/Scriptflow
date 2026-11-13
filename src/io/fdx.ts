import { getDocType, docTypeList } from '../doctypes';
import { Block, Run, Script, emptyTitlePage, normalizeRuns, printedRuns } from '../model';

// Final Draft (.fdx) is XML. We read and write the script body (paragraph
// types and bold/italic/underline). Final Draft applies its own template
// layout when opening the file.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toFdx(script: Script): string {
  const dt = getDocType(script.docType);
  const paras = script.blocks.map((b) => {
    const el = dt.elements.find((e) => e.id === b.type) ?? dt.elements.find((e) => e.id === dt.fallbackElement)!;
    const printed = printedRuns(b.runs);
    const runs = printed.length ? printed : [{ text: '' }];
    const texts = runs.map((r) => {
      const style = [r.bold && 'Bold', r.italic && 'Italic', r.underline && 'Underline'].filter(Boolean).join('+');
      return `<Text${style ? ` Style="${style}"` : ''}>${esc(r.text)}</Text>`;
    }).join('');
    return `    <Paragraph Type="${esc(el.fdxName)}">${texts}</Paragraph>`;
  });

  const tp = script.titlePage;
  const centered = (t: string) =>
    `      <Paragraph Alignment="Center" Type="General"><Text>${esc(t)}</Text></Paragraph>`;
  const tpParas = tp.title
    ? [centered(tp.title.toUpperCase()), centered(''), centered(tp.credit), centered(''), centered(tp.author),
       ...(tp.source ? [centered(''), centered(tp.source)] : [])]
    : [];

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    `<FinalDraft DocumentType="Script" Template="No" Version="5">`,
    '  <Content>',
    ...paras,
    '  </Content>',
    ...(tpParas.length ? ['  <TitlePage>', '    <Content>', ...tpParas, '    </Content>', '  </TitlePage>'] : []),
    '</FinalDraft>',
    '',
  ].join('\n');
}

export function parseFdx(xml: string): Script {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This .fdx file could not be read.');
  const content = Array.from(doc.documentElement.children).find((c) => c.tagName === 'Content');
  if (!content) throw new Error('This .fdx file has no script content.');
  const paras = Array.from(content.children).filter((c) => c.tagName === 'Paragraph');
  const typeNames = paras.map((p) => (p.getAttribute('Type') ?? '').toLowerCase());

  // Pick the document type that recognises the most paragraph types.
  const score = (id: string) => {
    const names = new Set(getDocType(id).elements.map((e) => e.fdxName.toLowerCase()));
    return typeNames.filter((n) => names.has(n)).length;
  };
  const dt = docTypeList.reduce((best, d) => (score(d.id) > score(best.id) ? d : best), docTypeList[0]);

  const blocks: Block[] = paras.map((p) => {
    const name = (p.getAttribute('Type') ?? '').toLowerCase();
    const el = dt.elements.find((e) => e.fdxName.toLowerCase() === name);
    const runs: Run[] = Array.from(p.getElementsByTagName('Text')).map((t) => {
      const style = (t.getAttribute('Style') ?? '').split('+');
      return {
        text: t.textContent ?? '',
        ...(style.includes('Bold') && { bold: true }),
        ...(style.includes('Italic') && { italic: true }),
        ...(style.includes('Underline') && { underline: true }),
      };
    });
    return { type: el?.id ?? dt.fallbackElement, runs: normalizeRuns(runs) };
  });

  const titlePage = emptyTitlePage();
  const tpEl = doc.getElementsByTagName('TitlePage')[0];
  if (tpEl) {
    const lines = Array.from(tpEl.getElementsByTagName('Paragraph'))
      .map((p) => p.textContent?.trim() ?? '').filter(Boolean);
    if (lines[0]) titlePage.title = lines[0];
    const by = lines.findIndex((l) => /^(written )?by$/i.test(l));
    if (by >= 0) { titlePage.credit = lines[by]; titlePage.author = lines[by + 1] ?? ''; }
  }
  return { docType: dt.id, titlePage, blocks };
}
