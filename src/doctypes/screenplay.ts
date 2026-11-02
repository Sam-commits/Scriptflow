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
      next: 'action', tab: 'action', shiftTab: 'transition',
      left: 1.5, width: 6.0, spaceBefore: 1, uppercase: true,
      keepWithNext: true, sceneStart: true, smartType: 'sceneHeading',
    },
    {
      id: 'action', label: 'Action', fdxName: 'Action',
      next: 'action', tab: 'character', shiftTab: 'scene_heading',
      left: 1.5, width: 6.0, spaceBefore: 1, splittable: true,
    },
    {
      id: 'character', label: 'Character', fdxName: 'Character',
      next: 'dialogue', tab: 'transition', shiftTab: 'action',
      left: 3.7, width: 3.3, spaceBefore: 1, uppercase: true,
      keepWithNext: true, speaker: true, smartType: 'character',
    },
    {
      id: 'parenthetical', label: 'Parenthetical', fdxName: 'Parenthetical',
      next: 'dialogue', tab: 'dialogue', shiftTab: 'dialogue',
      left: 3.1, width: 2.0, spaceBefore: 0, speech: true, keepWithNext: true,
    },
    {
      id: 'dialogue', label: 'Dialogue', fdxName: 'Dialogue',
      next: 'action', tab: 'parenthetical', shiftTab: 'character',
      left: 2.5, width: 3.5, spaceBefore: 0, speech: true, splittable: true,
    },
    {
      id: 'transition', label: 'Transition', fdxName: 'Transition',
      next: 'scene_heading', tab: 'scene_heading', shiftTab: 'character',
      left: 5.5, width: 2.0, align: 'right', spaceBefore: 1, uppercase: true,
      smartType: 'transition',
    },
    {
      id: 'shot', label: 'Shot', fdxName: 'Shot',
      next: 'action', tab: 'action', shiftTab: 'action',
      left: 1.5, width: 6.0, spaceBefore: 1, uppercase: true, keepWithNext: true,
    },
    {
      id: 'general', label: 'General', fdxName: 'General',
      next: 'general', tab: 'action', shiftTab: 'action',
      left: 1.5, width: 6.0, spaceBefore: 0, splittable: true,
    },
  ],
};
