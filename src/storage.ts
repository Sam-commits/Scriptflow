import { Script, emptyTitlePage } from './model';

// Scripts autosave to this browser's localStorage for now. Step 4 adds
// GitHub sync so they also live as Fountain files in a repository.

export interface ScriptMeta { id: string; title: string; docType: string; updatedAt: number }

const LIB = 'scriptflow:library';
const key = (id: string) => `scriptflow:script:${id}`;

function read<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ }
}

export function listScripts(): ScriptMeta[] {
  return read<ScriptMeta[]>(LIB, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadScript(id: string): Script | null {
  return read<Script | null>(key(id), null);
}

export function saveScript(id: string, script: Script) {
  write(key(id), script);
  const lib = read<ScriptMeta[]>(LIB, []).filter((m) => m.id !== id);
  lib.push({ id, title: script.titlePage.title || 'Untitled', docType: script.docType, updatedAt: Date.now() });
  write(LIB, lib);
}

export function deleteScript(id: string) {
  try { localStorage.removeItem(key(id)); } catch { /* ignore */ }
  write(LIB, read<ScriptMeta[]>(LIB, []).filter((m) => m.id !== id));
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function blankScript(docType: string): Script {
  return { docType, titlePage: emptyTitlePage(), blocks: [] };
}
