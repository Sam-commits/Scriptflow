import { Block } from '../model';

/**
 * Scene structures for the "/" scene builder. Each one turns the pop-up's
 * choices into empty elements with grey hints for the writer to fill in. Like
 * document types they are data, so new ones plug in here. Hints and notes are
 * never printed or exported.
 */

export interface BuildOptions {
  /** Finished scene heading, e.g. "INT. LIGHTHOUSE - LAMP ROOM - NIGHT". */
  heading: string;
  /** Characters in the scene, in capitals. */
  characters: string[];
  /** Exchange length, in speeches. */
  lines: number;
  /** Second heading, for intercuts. */
  second: string;
  /** Number of images in a montage. */
  shots: number;
  /** Scene note (goal, conflict, turn), put on the heading. */
  note: string;
}

export interface StructureDef {
  id: string;
  name: string;
  description: string;
  /** Document types this structure works in. */
  docTypes: string[];
  /** Which extra pop-up fields it uses. */
  uses?: { lines?: boolean; second?: boolean; shots?: boolean };
  build: (o: BuildOptions) => Block[];
}

const el = (type: string, text = '', hint?: string, note?: string): Block => ({
  type, runs: text ? [{ text }] : [], ...(hint && { hint }), ...(note && { note }),
});

/** The scene's heading, or an empty one with a hint when the pop-up left it blank. */
const head = (type: string, text: string, note: string) =>
  el(type, text, text ? undefined : type === 'scene' ? 'The scene heading' : 'Where and when: INT. or EXT., the place, the time', note || undefined);

const speakers = (chars: string[]) => (chars.length ? chars : ['CHARACTER']);

/** A character cue and an empty speech under it. */
function speech(name: string, hint: string): Block[] {
  return [el('character', name), el('dialogue', '', hint)];
}

function exchange(chars: string[], lines: number): Block[] {
  const who = speakers(chars);
  const other = who.length > 1 ? who : [...who, 'CHARACTER'];
  const out: Block[] = [];
  for (let i = 0; i < lines; i++) {
    const name = other[i % other.length];
    out.push(...speech(name, i === 0 ? `What does ${name} want from this conversation?` : i === lines - 1 ? `${name}: the line that turns the scene` : `${name} responds`));
  }
  return out;
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const STRUCTURES: StructureDef[] = [
  {
    id: 'basic',
    name: 'Basic scene',
    description: 'A heading, a line of action, then a speech for each character.',
    docTypes: ['screenplay'],
    build: (o) => [
      head('scene_heading', o.heading, o.note),
      el('action', '', o.characters.length ? 'What do we see? Who is here and what are they doing?' : 'What do we see and hear?'),
      ...o.characters.flatMap((c) => speech(c, `What does ${c} say?`)),
    ],
  },
  {
    id: 'dialogue',
    name: 'Dialogue exchange',
    description: 'A short setup, then speakers taking turns for as many lines as you choose.',
    docTypes: ['screenplay'],
    uses: { lines: true },
    build: (o) => [
      head('scene_heading', o.heading, o.note),
      el('action', '', 'Set the scene in a line or two.'),
      ...exchange(o.characters, o.lines),
    ],
  },
  {
    id: 'intercut',
    name: 'Intercut',
    description: 'Two places at once, like a phone call: both headings, then the conversation.',
    docTypes: ['screenplay'],
    uses: { second: true, lines: true },
    build: (o) => {
      const place = (h: string) => h.replace(/^(INT\.\/EXT\.|INT\.|EXT\.|I\/E\.|EST\.)\s*/i, '').replace(/\s+-\s+[^-]*$/, '');
      return [
        head('scene_heading', o.heading, o.note),
        el('action', '', 'Who is here, and how do they start the call?'),
        el('scene_heading', o.second, o.second ? undefined : 'The second place: INT. or EXT., the place, the time'),
        el('action', '', 'Who answers, and where are they?'),
        el('shot', `INTERCUT - ${place(o.heading) || 'FIRST PLACE'} / ${place(o.second) || 'SECOND PLACE'}`),
        ...exchange(o.characters, o.lines),
      ];
    },
  },
  {
    id: 'montage',
    name: 'Montage',
    description: 'A run of quick images that shows time passing, closed with END MONTAGE.',
    docTypes: ['screenplay'],
    uses: { shots: true },
    build: (o) => {
      const title = o.heading.replace(/^(INT\.\/EXT\.|INT\.|EXT\.|I\/E\.|EST\.)\s*/i, '').replace(/\s+-\s+[^-]*$/, '') || 'TITLE';
      const shots = Array.from({ length: o.shots }, (_, i) => el('action', '', `${letters[i % 26]}) One quick image or moment`));
      return [el('shot', `MONTAGE - ${title}`, undefined, o.note || undefined), ...shots, el('shot', 'END MONTAGE')];
    },
  },
  {
    id: 'flashback',
    name: 'Flashback',
    description: 'A scene from the past, marked FLASHBACK, with the way back to the present.',
    docTypes: ['screenplay'],
    build: (o) => [
      head('scene_heading', o.heading && `${o.heading} (FLASHBACK)`, o.note),
      el('action', '', 'What do we see? Show how this moment in the past is different.'),
      ...o.characters.flatMap((c) => speech(c, `What does ${c} say back then?`)),
      el('shot', 'BACK TO PRESENT'),
    ],
  },
  {
    id: 'stage-basic',
    name: 'Basic scene',
    description: 'A scene heading, the setting, then a speech for each character.',
    docTypes: ['stageplay'],
    build: (o) => [
      head('scene', o.heading, o.note),
      el('stage_direction', '', 'The setting: where are we, and who is on stage when the lights come up?'),
      ...o.characters.flatMap((c) => speech(c, `What does ${c} say?`)),
    ],
  },
  {
    id: 'stage-dialogue',
    name: 'Dialogue exchange',
    description: 'The setting, then speakers taking turns for as many lines as you choose.',
    docTypes: ['stageplay'],
    uses: { lines: true },
    build: (o) => [
      head('scene', o.heading, o.note),
      el('stage_direction', '', 'The setting in a line or two.'),
      ...exchange(o.characters, o.lines),
    ],
  },
];

export function structuresFor(docType: string, saved: SavedStructure[] = []): StructureDef[] {
  return [...STRUCTURES.filter((s) => s.docTypes.includes(docType)), ...saved.filter((s) => s.docType === docType).map(fromSaved)];
}

// ---- Templates saved from a scene ------------------------------------------------

/** One element of a saved layout. `speaker` numbers the people in it: 1 = first to speak. */
export interface SavedStep { type: string; speaker?: number; text?: string }

export interface SavedStructure { id: string; name: string; docType: string; steps: SavedStep[] }

export const SAVED_KEY = 'scriptflow:structures';

/** Keep fixed words (transitions, MONTAGE, INTERCUT…) but not what the writer wrote. */
const KEEP_TEXT = /^(INTERCUT|MONTAGE|END MONTAGE|BACK TO PRESENT|SERIES OF SHOTS|END SERIES OF SHOTS|[A-Z ]+ TO:|FADE (IN|OUT)[:.]?)(?![A-Z])/;

/** The layout of a scene: element types, with speakers numbered in order of appearance. */
export function layoutOf(blocks: Block[], isSpeaker: (type: string) => boolean): SavedStep[] {
  const order: string[] = [];
  return blocks.map((b) => {
    const text = b.runs.map((r) => r.text).join('').trim();
    if (isSpeaker(b.type)) {
      const name = text.replace(/\s*\(.*$/, '').toUpperCase();
      if (!order.includes(name)) order.push(name);
      return { type: b.type, speaker: order.indexOf(name) + 1 };
    }
    return KEEP_TEXT.test(text.toUpperCase()) ? { type: b.type, text: text.toUpperCase() } : { type: b.type };
  });
}

function fromSaved(s: SavedStructure): StructureDef {
  return {
    id: `saved:${s.id}`,
    name: s.name,
    description: `Your template: ${s.steps.length} elements.`,
    docTypes: [s.docType],
    build: (o) => {
      let firstHeading = true;
      return s.steps.map((step, i): Block => {
        if (step.speaker) {
          const name = o.characters[step.speaker - 1] ?? `CHARACTER ${step.speaker}`;
          return el(step.type, name);
        }
        if (firstHeading && i === 0 && (step.type === 'scene_heading' || step.type === 'scene')) {
          firstHeading = false;
          return head(step.type, o.heading, o.note);
        }
        if (step.text) return el(step.type, step.text);
        const prev = s.steps[i - 1];
        const who = prev?.speaker ? o.characters[prev.speaker - 1] ?? `CHARACTER ${prev.speaker}` : '';
        return el(step.type, '', who && step.type === 'dialogue' ? `What does ${who} say?` : undefined);
      });
    },
  };
}

export function loadSaved(): SavedStructure[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((s) => s && typeof s.name === 'string' && Array.isArray(s.steps)) : [];
  } catch { return []; }
}

export function saveSaved(list: SavedStructure[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}
