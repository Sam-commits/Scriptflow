import type { DocTypeDef } from './types';

// US stageplay layout, close to Final Draft's "Stage Play" template:
// centered act/scene/character headings, full-width dialogue, and
// indented italic stage directions.
export const stageplay: DocTypeDef = {
  id: 'stageplay',
  name: 'Stageplay',
  firstElement: 'act',
  fallbackElement: 'stage_direction',
  moreContd: true,
  fountain: false,
  elements: [
    {
      id: 'act', label: 'Act', fdxName: 'Act',
      hint: 'ACT ONE', help: 'starts a new act on a new page.',
      next: 'scene', tab: 'scene', shiftTab: 'scene',
      left: 1.5, width: 6.0, align: 'center', spaceBefore: 2, uppercase: true,
      underline: true, keepWithNext: true, sectionStart: true, pageBreakBefore: true,
    },
    {
      id: 'scene', label: 'Scene', fdxName: 'Scene',
      hint: 'SCENE 1', help: 'starts a new scene within the act.',
      next: 'stage_direction', tab: 'stage_direction', shiftTab: 'act',
      left: 1.5, width: 6.0, align: 'center', spaceBefore: 2, uppercase: true,
      keepWithNext: true, sceneStart: true,
    },
    {
      id: 'stage_direction', label: 'Stage Direction', fdxName: 'Stage Direction',
      hint: 'What happens on stage?', help: 'what the audience sees: entrances, exits and action.',
      next: 'character', tab: 'character', shiftTab: 'scene',
      left: 3.25, width: 4.25, spaceBefore: 1, italic: true, splittable: true,
    },
    {
      id: 'character', label: 'Character', fdxName: 'Character',
      hint: 'Who speaks? Their name in capitals', help: 'the name of the person about to speak.',
      next: 'dialogue', tab: 'stage_direction', shiftTab: 'stage_direction',
      left: 1.5, width: 6.0, align: 'center', spaceBefore: 1, uppercase: true,
      keepWithNext: true, speaker: true, smartType: 'character',
    },
    {
      id: 'parenthetical', label: 'Parenthetical', fdxName: 'Parenthetical',
      hint: 'How is the line said?', help: 'a few words on how a line is said.',
      next: 'dialogue', tab: 'dialogue', shiftTab: 'dialogue',
      left: 3.25, width: 3.0, spaceBefore: 0, italic: true, speech: true, keepWithNext: true,
    },
    {
      id: 'dialogue', label: 'Dialogue', fdxName: 'Dialogue',
      hint: 'What do they say?', help: 'the words the character speaks.',
      next: 'character', tab: 'parenthetical', shiftTab: 'character',
      left: 1.5, width: 6.0, spaceBefore: 0, speech: true, splittable: true,
    },
  ],
};
