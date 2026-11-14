/**
 * A document type (Screenplay, Stageplay, ...) is pure data: the elements it
 * offers, how each one is laid out on the page, and how Enter/Tab move between
 * them. The editor, SmartType, navigator and exporters all read from this, so
 * adding a new format mostly means adding a new definition file.
 */

export type SmartTypeKind = 'sceneHeading' | 'character' | 'transition';

export interface ElementDef {
  id: string;
  label: string;
  /** Element created when pressing Enter at the end of this one. */
  next: string;
  /** Element this one turns into when Tab is pressed while it's empty
   *  (or the element created when Tab is pressed at the end of a non-empty one). */
  tab?: string;
  /** Reverse of `tab`, for Shift+Tab on an empty element. */
  shiftTab?: string;
  /** Distance from the left edge of the page, in inches. */
  left: number;
  /** Line width in inches. Courier 12pt fits 10 characters per inch. */
  width: number;
  align?: 'left' | 'center' | 'right';
  /** Blank lines above this element (ignored at the top of a page). */
  spaceBefore: number;
  uppercase?: boolean;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
  /** Text wrapped around the element when exported, e.g. stage directions "(…)". */
  wrap?: [string, string];
  /** Never leave this element as the last thing on a page. */
  keepWithNext?: boolean;
  /** Long blocks of this element may break across pages. */
  splittable?: boolean;
  /** Part of a speech (dialogue / parenthetical) for (MORE)/(CONT'D) handling. */
  speech?: boolean;
  /** This element names the speaker of the speech that follows. */
  speaker?: boolean;
  /** Starts a new scene in the navigator and gets a scene number. */
  sceneStart?: boolean;
  /** Starts a new act/section in the navigator. */
  sectionStart?: boolean;
  /** Always begins a new page when printed. */
  pageBreakBefore?: boolean;
  smartType?: SmartTypeKind;
  /** Grey prompt shown in an empty element of this kind (Beginner hints). */
  hint?: string;
  /** One line on what the element is for, for the status-bar element guide. */
  help?: string;
  /** Name used in Final Draft (.fdx) files. */
  fdxName: string;
}

export interface DocTypeDef {
  id: string;
  name: string;
  elements: ElementDef[];
  /** Element a new, empty document starts with. */
  firstElement: string;
  /** Element used for unknown/imported plain paragraphs. */
  fallbackElement: string;
  /** Print (MORE) / CHARACTER (CONT'D) when a speech breaks across pages. */
  moreContd: boolean;
  /** Whether Fountain import/export applies to this format. */
  fountain: boolean;
}

export function getElement(dt: DocTypeDef, id: string): ElementDef {
  return dt.elements.find((e) => e.id === id) ?? dt.elements.find((e) => e.id === dt.fallbackElement)!;
}
