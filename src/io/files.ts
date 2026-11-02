import { Script } from '../model';
import { parseFdx, toFdx } from './fdx';
import { parseFountain, toFountain } from './fountain';

export const NATIVE_EXT = '.scriptflow';

export function download(name: string, data: string | Blob, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(script: Script): string {
  return (script.titlePage.title || 'Untitled').replace(/[^\w\- ]+/g, '').trim() || 'Untitled';
}

export function parseFile(name: string, text: string): Script {
  const lower = name.toLowerCase();
  if (lower.endsWith('.fdx')) return parseFdx(text);
  if (lower.endsWith(NATIVE_EXT) || lower.endsWith('.json')) {
    const s = JSON.parse(text) as Script;
    if (!s || !Array.isArray(s.blocks) || !s.docType) throw new Error('This is not a Scriptflow file.');
    return s;
  }
  return parseFountain(text);
}

export { toFdx, toFountain };
