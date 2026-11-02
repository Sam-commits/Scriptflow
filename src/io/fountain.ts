import { Block, Run, Script, TitlePage, blockText, emptyTitlePage, normalizeRuns } from '../model';

// Fountain (https://fountain.io) is a plain-text screenplay format. It's the
// format we'll keep scripts in on GitHub, because plain text diffs cleanly.

const SCENE_RE = /^(int|ext|est|int\.?\/ext|i\/e)[. ]/i;
const TRANSITION_RE = /^[A-Z0-9 .'-]+ TO:$/;

/** Parse Fountain emphasis (***bold italic***, **bold**, *italic*, _underline_). */
export function parseEmphasis(text: string): Run[] {
  const runs: Run[] = [];
  const style = { bold: false, italic: false, underline: false };
  let buf = '';
  const flush = () => {
    if (buf) runs.push({ text: buf, ...(style.bold && { bold: true }), ...(style.italic && { italic: true }), ...(style.underline && { underline: true }) });
    buf = '';
  };
  // Only treat markers as styling when a matching closer exists, so stray
  // asterisks ("5 * 3") are kept as text.
  const hasCloser = (marker: string, from: number) => text.indexOf(marker, from) !== -1;
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) { buf += text[i + 1]; i += 2; continue; }
    if (text.startsWith('***', i) && (style.bold && style.italic ? true : hasCloser('***', i + 3))) {
      flush(); const on = !(style.bold && style.italic); style.bold = on; style.italic = on; i += 3; continue;
    }
    if (text.startsWith('**', i) && (style.bold || hasCloser('**', i + 2))) {
      flush(); style.bold = !style.bold; i += 2; continue;
    }
    if (c === '*' && (style.italic || hasCloser('*', i + 1))) {
      flush(); style.italic = !style.italic; i += 1; continue;
    }
    if (c === '_' && (style.underline || hasCloser('_', i + 1))) {
      flush(); style.underline = !style.underline; i += 1; continue;
    }
    buf += c; i += 1;
  }
  flush();
  return normalizeRuns(runs);
}

export function emphasisToFountain(runs: Run[]): string {
  return runs.map((r) => {
    let t = r.text.replace(/([*_\\])/g, '\\$1');
    if (r.underline) t = `_${t}_`;
    if (r.bold && r.italic) t = `***${t}***`;
    else if (r.bold) t = `**${t}**`;
    else if (r.italic) t = `*${t}*`;
    return t;
  }).join('');
}

const TITLE_KEYS: Record<string, keyof TitlePage> = {
  title: 'title', credit: 'credit', author: 'author', authors: 'author',
  source: 'source', 'draft date': 'draftDate', contact: 'contact',
};

function stripNotes(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '');
}

function isUpperLine(s: string): boolean {
  const name = s.replace(/\(.*?\)/g, '').replace(/\^$/, '').trim();
  return name.length > 0 && /[A-Z]/.test(name) && name === name.toUpperCase();
}

export function parseFountain(source: string): Script {
  const text = stripNotes(source.replace(/\r\n?/g, '\n'));
  let lines = text.split('\n');
  const titlePage = emptyTitlePage();

  // Title page: "Key: value" lines at the very top, ended by a blank line.
  if (/^[A-Za-z ]+:/.test(lines[0] ?? '')) {
    let i = 0;
    let key: keyof TitlePage | null = null;
    for (; i < lines.length && lines[i].trim() !== ''; i++) {
      const m = lines[i].match(/^([A-Za-z ]+):\s*(.*)$/);
      if (m) {
        key = TITLE_KEYS[m[1].trim().toLowerCase()] ?? null;
        if (key) titlePage[key] = m[2].trim();
      } else if (key) {
        titlePage[key] = (titlePage[key] ? titlePage[key] + '\n' : '') + lines[i].trim();
      }
    }
    lines = lines.slice(i + 1);
  }

  const blocks: Block[] = [];
  const push = (type: string, t: string) => blocks.push({ type, runs: parseEmphasis(t) });
  const blank = (i: number) => i < 0 || i >= lines.length || lines[i].trim() === '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    if (/^={3,}$/.test(line)) continue;          // page break
    if (/^#/.test(line) || /^=(?!=)/.test(line)) continue; // sections & synopses (outline data, step 3)

    const prevBlank = blank(i - 1);
    const nextBlank = blank(i + 1);

    if (line.startsWith('!')) { push('action', line.slice(1)); continue; }
    if (line.startsWith('.') && !line.startsWith('..')) {
      push('scene_heading', line.slice(1).replace(/\s*#[^#]+#$/, '')); continue;
    }
    if (prevBlank && SCENE_RE.test(line)) {
      push('scene_heading', line.replace(/\s*#[^#]+#$/, '')); continue;
    }
    if (line.startsWith('>') && line.endsWith('<')) { push('action', line.slice(1, -1).trim()); continue; }
    if (line.startsWith('>')) { push('transition', line.slice(1).trim()); continue; }
    if (prevBlank && nextBlank && TRANSITION_RE.test(line)) { push('transition', line); continue; }

    const forcedChar = line.startsWith('@');
    if (prevBlank && !nextBlank && (forcedChar || isUpperLine(line))) {
      push('character', (forcedChar ? line.slice(1) : line).replace(/\s*\^$/, ''));
      for (i = i + 1; i < lines.length && lines[i].trim() !== ''; i++) {
        const d = lines[i].trim();
        if (d.startsWith('(') && d.endsWith(')')) push('parenthetical', d);
        else push('dialogue', d);
      }
      continue;
    }

    // Action: keep consecutive lines together in one paragraph.
    let para = raw.replace(/^\s+/, '');
    while (!blank(i + 1)) para += '\n' + lines[++i];
    push('action', line.startsWith('~') ? para.slice(1) : para);
  }

  return { docType: 'screenplay', titlePage, blocks: mergeDialogue(blocks) };
}

/** Consecutive dialogue lines in Fountain are one speech; join them. */
function mergeDialogue(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && prev.type === 'dialogue' && b.type === 'dialogue') {
      prev.runs = normalizeRuns([...prev.runs, { text: '\n' }, ...b.runs]);
    } else out.push(b);
  }
  return out;
}

export function toFountain(script: Script): string {
  const out: string[] = [];
  const tp = script.titlePage;
  const tpLines: string[] = [];
  const addKey = (k: string, v: string) => {
    if (!v) return;
    const parts = v.split('\n');
    if (parts.length === 1) tpLines.push(`${k}: ${v}`);
    else tpLines.push(`${k}:`, ...parts.map((p) => `    ${p}`));
  };
  addKey('Title', tp.title);
  if (tp.title || tp.author) addKey('Credit', tp.credit);
  addKey('Author', tp.author);
  addKey('Source', tp.source);
  addKey('Draft date', tp.draftDate);
  addKey('Contact', tp.contact);
  if (tpLines.length) out.push(tpLines.join('\n'));

  let prevType = '';
  for (const b of script.blocks) {
    const plain = blockText(b);
    let t = emphasisToFountain(b.runs);
    const inSpeech = (b.type === 'dialogue' || b.type === 'parenthetical') &&
      ['character', 'dialogue', 'parenthetical'].includes(prevType);
    if (!inSpeech && out.length) out.push('');
    switch (b.type) {
      case 'scene_heading':
        t = t.toUpperCase();
        if (!SCENE_RE.test(plain)) t = '.' + t;
        break;
      case 'character':
        t = t.toUpperCase();
        if (!isUpperLine(plain.toUpperCase()) || SCENE_RE.test(plain)) t = '@' + t;
        break;
      case 'transition':
        t = t.toUpperCase();
        if (!TRANSITION_RE.test(plain.toUpperCase())) t = '> ' + t;
        break;
      case 'shot':
        t = '!' + t.toUpperCase();
        break;
      case 'parenthetical':
        if (!plain.startsWith('(')) t = `(${t})`;
        break;
      case 'dialogue':
        // Blank lines inside dialogue would end the speech; Fountain uses two spaces.
        t = t.split('\n').map((l) => l || '  ').join('\n');
        break;
      default: {
        // Action that could be mistaken for another element is forced with "!".
        const first = plain.split('\n')[0];
        if (SCENE_RE.test(first) || isUpperLine(first) || /^[.>@~!#=]/.test(first)) t = '!' + t;
      }
    }
    out.push(t);
    prevType = b.type;
  }
  return out.join('\n') + '\n';
}
