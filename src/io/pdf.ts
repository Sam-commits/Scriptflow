import { jsPDF } from 'jspdf';
import { getDocType } from '../doctypes';
import { Script } from '../model';
import { CHARS_PER_INCH, Line, paginate } from './paginate';

const LINE_H = 1 / 6; // inches (12pt)
const TOP = 1;        // inches

function fontStyle(bold?: boolean, italic?: boolean) {
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
}

function drawLine(pdf: jsPDF, line: Line, y: number) {
  const len = line.segments.reduce((n, s) => n + s.text.length, 0);
  const textW = len / CHARS_PER_INCH;
  let x = line.left;
  if (line.align === 'center') x = line.left + (line.width - textW) / 2;
  if (line.align === 'right') x = line.left + line.width - textW;
  for (const s of line.segments) {
    pdf.setFont('courier', fontStyle(s.bold, s.italic));
    pdf.text(s.text, x, y);
    const w = s.text.length / CHARS_PER_INCH;
    if (s.underline) { pdf.setLineWidth(0.01); pdf.line(x, y + 0.03, x + w, y + 0.03); }
    x += w;
  }
  if (line.sceneNumber !== undefined) {
    pdf.setFont('courier', 'normal');
    const n = String(line.sceneNumber);
    pdf.text(n, 1.0, y);
    pdf.text(n, 7.4, y);
  }
}

export function scriptToPdf(script: Script, opts: { sceneNumbers?: boolean } = {}): jsPDF {
  const dt = getDocType(script.docType);
  const pdf = new jsPDF({ unit: 'in', format: 'letter' });
  pdf.setFontSize(12);
  pdf.setFont('courier', 'normal');
  const tp = script.titlePage;
  let first = true;

  if (tp.title) {
    const center = (t: string, y: number) => pdf.text(t, 4.25, y, { align: 'center' });
    center(tp.title.toUpperCase(), 3.5);
    center(tp.credit || 'Written by', 4.0);
    center(tp.author, 4.35);
    if (tp.source) tp.source.split('\n').forEach((l, i) => center(l, 5.0 + i * LINE_H));
    const left = [tp.draftDate, ...tp.contact.split('\n')].filter(Boolean);
    left.forEach((l, i) => pdf.text(l, 1.5, 9.5 + (i - left.length + 1) * LINE_H));
    first = false;
  }

  paginate(dt, script.blocks, opts).forEach((page, pi) => {
    if (!first) pdf.addPage();
    first = false;
    if (pi > 0) { pdf.setFont('courier', 'normal'); pdf.text(`${pi + 1}.`, 7.5, 0.5, { align: 'right' }); }
    page.forEach((line, li) => { if (line) drawLine(pdf, line, TOP + LINE_H * (li + 1) - 0.03); });
  });
  return pdf;
}
