import type { DocTypeDef } from './types';

// Measurements follow the US industry standard used by Final Draft's
// default screenplay template (8.5" x 11" page, Courier 12pt).
export const screenplay: DocTypeDef = {
  id: 'screenplay',
  name: 'Screenplay',
  firstElement: 'scene_heading',
  fallbackElement: 'action',
  moreContd: true,
  fountain: true,
  elements: [
    {
      id: 'scene_heading', label: 'Scene Heading', fdxName: 'Scene Heading',
      hint: 'INT. or EXT., the place, then DAY or NIGHT', help: 'starts a new scene: inside or outside, where, and when.',
      next: 'action', tab: 'action', shiftTab: 'transition',
      left: 1.5, width: 6.0, spaceBefore: 1, uppercase: true,
      keepWithNext: true, sceneStart: true, smartType: 'sceneHeading',
    },
    {
      id: 'action', label: 'Action', fdxName: 'Action',
      hint: 'What do we see and hear?', help: 'describes what we see and hear, in the present tense.',
      next: 'action', tab: 'character', shiftTab: 'scene_heading',
      left: 1.5, width: 6.0, spaceBefore: 1, splittable: true,
    },
    {
      id: 'character', label: 'Character', fdxName: 'Character',
      hint: 'Who speaks? Their name in capitals', help: 'the name of the person about to speak.',
      next: 'dialogue', tab: 'transition', shiftTab: 'action',
      left: 3.7, width: 3.3, spaceBefore: 1, uppercase: true,
      keepWithNext: true, speaker: true, smartType: 'character',
    },
    {
      id: 'parenthetical', label: 'Parenthetical', fdxName: 'Parenthetical',
      hint: 'How is the line said?', help: 'a few words on how a line is said. Use sparingly.',
      next: 'dialogue', tab: 'dialogue', shiftTab: 'dialogue',
      left: 3.1, width: 2.0, spaceBefore: 0, speech: true, keepWithNext: true,
    },
    {
      id: 'dialogue', label: 'Dialogue', fdxName: 'Dialogue',
      hint: 'What do they say?', help: 'the words the character speaks.',
      next: 'action', tab: 'parenthetical', shiftTab: 'character',
      left: 2.5, width: 3.5, spaceBefore: 0, speech: true, splittable: true,
    },
    {
      id: 'transition', label: 'Transition', fdxName: 'Transition',
      hint: 'CUT TO:', help: 'how one scene moves to the next, like CUT TO:',
      next: 'scene_heading', tab: 'scene_heading', shiftTab: 'character',
      left: 5.5, width: 2.0, align: 'right', spaceBefore: 1, uppercase: true,
      smartType: 'transition',
    },
    {
      id: 'shot', label: 'Shot', fdxName: 'Shot',
      hint: 'ANGLE ON, CLOSE ON\u2026', help: 'points the camera at something specific.',
      next: 'action', tab: 'action', shiftTab: 'action',
      left: 1.5, width: 6.0, spaceBefore: 1, uppercase: true, keepWithNext: true,
    },
    {
      id: 'general', label: 'General', fdxName: 'General',
      hint: 'Any text', help: 'plain text with no screenplay formatting.',
      next: 'general', tab: 'action', shiftTab: 'action',
      left: 1.5, width: 6.0, spaceBefore: 0, splittable: true,
    },
  ],
};
