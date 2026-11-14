import { CharacterProfile, SceneRef, Script, TagItem } from '../model';
import { SceneRange, normName } from '../tags/breakdown';

/**
 * Character profiles: the fields a profile offers are data, like document
 * types and tag categories, so the panel, the Markdown export and the tests
 * all read the same list.
 */

export type TextKey = 'role' | 'age' | 'occupation' | 'look' | 'personality' | 'voice'
  | 'want' | 'need' | 'desire' | 'fear' | 'background' | 'wound' | 'secret' | 'arcStart' | 'arcEnd' | 'notes';
export type ListKey = 'flaws' | 'strengths';

export interface TextField { key: TextKey; label: string; hint: string; long?: boolean }
export interface ProfileSection { id: string; title: string; fields: TextField[]; lists?: { key: ListKey; label: string; hint: string }[] }

export const ROLES = ['Protagonist', 'Antagonist', 'Deuteragonist', 'Love interest', 'Mentor', 'Sidekick', 'Foil', 'Supporting', 'Minor'];

export const RELATIONSHIP_KINDS = [
  'Friend', 'Best friend', 'Rival', 'Enemy', 'Ally', 'Mentor', 'Student', 'Love interest', 'Partner', 'Spouse', 'Ex',
  'Parent', 'Child', 'Sibling', 'Relative', 'Boss', 'Employee', 'Colleague', 'Stranger',
];

export const PROFILE_SECTIONS: ProfileSection[] = [
  {
    id: 'profile', title: 'Profile', fields: [
      { key: 'role', label: 'Role', hint: 'Protagonist, antagonist, mentor…' },
      { key: 'age', label: 'Age', hint: '60s' },
      { key: 'occupation', label: 'Occupation', hint: 'Lighthouse keeper' },
      { key: 'look', label: 'Look', hint: 'How they look and dress', long: true },
      { key: 'personality', label: 'Personality', hint: 'Temperament, habits, contradictions', long: true },
      { key: 'voice', label: 'Voice', hint: 'How they talk: rhythm, slang, catchphrases', long: true },
    ],
  },
  {
    id: 'motivation', title: 'Wants, needs & desires', fields: [
      { key: 'want', label: 'Want', hint: 'The outer goal they chase on screen', long: true },
      { key: 'need', label: 'Need', hint: 'What they actually need to learn or face, often without knowing it', long: true },
      { key: 'desire', label: 'Desire', hint: 'The deeper longing underneath the want', long: true },
      { key: 'fear', label: 'Fear', hint: 'What they avoid at all costs', long: true },
    ],
  },
  {
    id: 'flaws', title: 'Flaws & strengths', fields: [],
    lists: [
      { key: 'flaws', label: 'Flaws', hint: 'Add a flaw' },
      { key: 'strengths', label: 'Strengths', hint: 'Add a strength' },
    ],
  },
  {
    id: 'background', title: 'Background', fields: [
      { key: 'background', label: 'Backstory', hint: 'Where they come from and what shaped them', long: true },
      { key: 'wound', label: 'Wound', hint: 'The past hurt that drives the flaw', long: true },
      { key: 'secret', label: 'Secret', hint: 'What they hide from others', long: true },
    ],
  },
];

export const ARC_FIELDS: TextField[] = [
  { key: 'arcStart', label: 'At the start', hint: 'Who they are when we meet them', long: true },
  { key: 'arcEnd', label: 'By the end', hint: 'Who they have become', long: true },
];

export const NOTES_FIELD: TextField = { key: 'notes', label: 'Notes', hint: 'Anything else', long: true };

export const emptyProfile = (itemId: string): CharacterProfile => ({ itemId });

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : false);

/** Whether a profile holds anything a writer typed (so deleting it should ask first). */
export function profileHasContent(p: CharacterProfile | undefined): boolean {
  if (!p) return false;
  return Object.entries(p).some(([k, v]) => k !== 'itemId' && (k === 'scenes'
    ? (v as CharacterProfile['scenes'])!.some((s) => has(s.note) || has(s.wardrobe))
    : has(v)));
}

/** Change one profile (creating it if needed) and return the new list. */
export function upsertProfile(list: CharacterProfile[], itemId: string, fn: (p: CharacterProfile) => CharacterProfile): CharacterProfile[] {
  const cur = list.find((p) => p.itemId === itemId);
  const next = fn(cur ?? emptyProfile(itemId));
  return cur ? list.map((p) => (p === cur ? next : p)) : [...list, next];
}

/** Profiles after a Cast item is deleted: its profile goes, and so do relationships pointing at it. */
export function dropCharacter(list: CharacterProfile[], itemId: string): CharacterProfile[] {
  return list.filter((p) => p.itemId !== itemId).map((p) => (p.relationships?.some((r) => r.to === itemId)
    ? { ...p, relationships: p.relationships.filter((r) => r.to !== itemId) } : p));
}

/**
 * Profiles after one Cast item is merged into another. If both have a profile,
 * the target keeps its own answers and takes the source's where it has none.
 */
export function mergeCharacter(list: CharacterProfile[], fromId: string, toId: string): CharacterProfile[] {
  const from = list.find((p) => p.itemId === fromId);
  const to = list.find((p) => p.itemId === toId);
  let rest = list.filter((p) => p !== from && p !== to);
  let merged: CharacterProfile | undefined = to;
  if (from) {
    merged = { ...from, ...(to ?? {}), itemId: toId } as CharacterProfile;
    for (const k of Object.keys(from) as (keyof CharacterProfile)[]) {
      if (k === 'itemId') continue;
      const a = to?.[k], b = from[k];
      if (Array.isArray(a) && Array.isArray(b)) (merged as unknown as Record<string, unknown>)[k] = [...a, ...b];
      else if (!has(a)) (merged as unknown as Record<string, unknown>)[k] = b;
    }
  }
  if (merged) rest = [...rest, merged];
  return rest.map((p) => ({
    ...p,
    ...(p.relationships && {
      relationships: p.relationships.map((r) => (r.to === fromId ? { ...r, to: toId } : r)).filter((r) => r.to !== p.itemId),
    }),
  }));
}

// ---- Scene references -------------------------------------------------------

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Headings close enough to be the same scene being edited ("INT. KITCH" and "INT. KITCHEN - DAY"). */
function similar(a: string, b: string): boolean {
  const x = normName(a), y = normName(b);
  if (!x || !y) return true;
  if (x.startsWith(y) || y.startsWith(x)) return true;
  return editDistance(x, y) <= Math.max(3, Math.round(Math.max(x.length, y.length) * 0.2));
}

/**
 * The scene a reference points at now: a scene with the same heading (the one
 * nearest the old number), else the scene at the old number if its heading is
 * still close. Undefined if the scene is gone.
 */
export function resolveScene(ref: SceneRef, scenes: SceneRange[]): SceneRange | undefined {
  const real = scenes.filter((s) => s.num > 0);
  const same = real.filter((s) => normName(s.heading) === normName(ref.heading));
  if (same.length) return same.reduce((a, b) => (Math.abs(b.num - ref.num) < Math.abs(a.num - ref.num) ? b : a));
  const at = real.find((s) => s.num === ref.num);
  return at && similar(at.heading, ref.heading) ? at : undefined;
}

export const refOf = (s: SceneRange): SceneRef => ({ num: s.num, heading: s.heading });

const heal = (ref: SceneRef, scenes: SceneRange[]): SceneRef => {
  const s = resolveScene(ref, scenes);
  return s && (s.num !== ref.num || s.heading !== ref.heading) ? refOf(s) : ref;
};

/**
 * Bring every scene reference up to date with the script, so notes follow a
 * scene when scenes are added, moved or renamed. Returns the same array when
 * nothing changed, so it is cheap to call after every edit.
 */
export function healProfiles(list: CharacterProfile[], scenes: SceneRange[]): CharacterProfile[] {
  let changed = false;
  const out = list.map((p) => {
    let pc = false;
    const beats = p.arcBeats?.map((b) => {
      if (!b.scene) return b;
      const r = heal(b.scene, scenes);
      if (r === b.scene) return b;
      pc = true;
      return { ...b, scene: r };
    });
    const notes = p.scenes?.map((n) => {
      const r = heal(n.scene, scenes);
      if (r === n.scene) return n;
      pc = true;
      return { ...n, scene: r };
    });
    if (!pc) return p;
    changed = true;
    return { ...p, ...(beats && { arcBeats: beats }), ...(notes && { scenes: notes }) };
  });
  return changed ? out : list;
}

/** One character's notes for a scene, if any. */
export function sceneNote(p: CharacterProfile | undefined, scene: SceneRange, scenes: SceneRange[]) {
  return p?.scenes?.find((n) => resolveScene(n.scene, scenes)?.num === scene.num);
}

/** Every character's wardrobe for one scene, for the breakdown panel and CSV. */
export function sceneWardrobe(script: Pick<Script, 'characters' | 'tags'>, scene: SceneRange, scenes: SceneRange[]) {
  const byId = new Map((script.tags ?? []).map((i) => [i.id, i]));
  return (script.characters ?? []).flatMap((p) => {
    const item = byId.get(p.itemId);
    const n = sceneNote(p, scene, scenes);
    return item && n?.wardrobe?.trim() ? [{ item, wardrobe: n.wardrobe.trim() }] : [];
  }).sort((a, b) => a.item.name.localeCompare(b.item.name));
}

// ---- Export ------------------------------------------------------------------

/** All profiles as a Markdown "character bible". */
export function profilesMarkdown(script: Script, scenes: SceneRange[]): string {
  const items = new Map((script.tags ?? []).map((i) => [i.id, i]));
  const name = (id: string) => items.get(id)?.name ?? '(deleted character)';
  const out: string[] = [`# ${script.titlePage.title || 'Untitled'}: characters`, ''];
  const profiles = (script.characters ?? []).filter((p) => items.has(p.itemId) && profileHasContent(p))
    .sort((a, b) => name(a.itemId).localeCompare(name(b.itemId)));
  const line = (label: string, v?: string) => { if (v?.trim()) out.push(`**${label}:** ${v.trim().replace(/\n+/g, ' ')}`, ''); };
  const sceneLabel = (r: SceneRef) => { const s = resolveScene(r, scenes); return s ? `Scene ${s.num}, ${s.heading}` : `${r.heading} (no longer in the script)`; };
  for (const p of profiles) {
    out.push(`## ${name(p.itemId)}`, '');
    if (p.aliases?.length) line('Also called', p.aliases.join(', '));
    for (const sec of PROFILE_SECTIONS) {
      for (const f of sec.fields) line(f.label, p[f.key]);
      for (const l of sec.lists ?? []) if (p[l.key]?.length) { out.push(`**${l.label}:**`, ...p[l.key]!.map((x) => `- ${x}`), ''); }
    }
    for (const f of ARC_FIELDS) line(`Arc, ${f.label.toLowerCase()}`, p[f.key]);
    if (p.arcBeats?.length) out.push('**Arc beats:**', ...p.arcBeats.map((b) => `- ${b.text}${b.scene ? ` (${sceneLabel(b.scene)})` : ''}`), '');
    if (p.relationships?.length) out.push('**Relationships:**', ...p.relationships.map((r) => `- ${name(r.to)}: ${r.kind}${r.notes ? `. ${r.notes}` : ''}`), '');
    const sn = (p.scenes ?? []).filter((n) => n.note?.trim() || n.wardrobe?.trim());
    if (sn.length) {
      out.push('**Scene notes:**');
      for (const n of sn) {
        const bits = [n.wardrobe?.trim() && `Wardrobe: ${n.wardrobe.trim()}`, n.note?.trim()].filter(Boolean);
        out.push(`- ${sceneLabel(n.scene)}: ${bits.join('. ')}`);
      }
      out.push('');
    }
    line('Notes', p.notes);
  }
  if (!profiles.length) out.push('No character profiles yet.', '');
  return out.join('\n');
}

/** Characters for the profiles list: every Cast item, A to Z. */
export const castItems = (items: TagItem[]) => items.filter((i) => i.category === 'cast').sort((a, b) => a.name.localeCompare(b.name));
