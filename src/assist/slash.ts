import { SavedStructure, structuresFor } from '../structures';

/** Entries in the "/" menu, typed on an empty line. */
export interface SlashCommand {
  id: string;
  label: string;
  desc: string;
}

export function slashCommands(docType: string, saved: SavedStructure[] = []): SlashCommand[] {
  const structures = structuresFor(docType, saved);
  return [
    { id: 'scene', label: 'Scene', desc: 'Build a new scene in a pop-up' },
    ...structures.slice(1).map((s) => ({ id: `scene:${s.id}`, label: s.name, desc: s.description })),
    { id: 'character', label: 'Character', desc: 'Add a name to the cast list' },
    { id: 'names', label: 'Names & places', desc: 'See every character and place; rename one everywhere' },
  ];
}

/** Commands matching what was typed after "/": by the start of any word in the name. */
export function matchSlash(cmds: SlashCommand[], typed: string): SlashCommand[] {
  const t = typed.trim().toLowerCase();
  if (!t) return cmds;
  return cmds.filter((c) => c.label.toLowerCase().split(/[\s&/-]+/).some((w) => w.startsWith(t)) || c.label.toLowerCase().startsWith(t));
}

/** "/sc" on an otherwise empty line -> "sc"; null when the line isn't a slash command. */
export function slashQuery(text: string): string | null {
  const m = /^\/([\p{L} ]{0,24})$/u.exec(text);
  return m ? m[1] : null;
}
