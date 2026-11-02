import { Script, plainBlock as b } from './model';

export const sampleScreenplay: Script = {
  docType: 'screenplay',
  titlePage: { title: 'The Lighthouse Keeper', credit: 'Written by', author: 'Your Name', source: '', draftDate: '', contact: '' },
  blocks: [
    b('transition', 'FADE IN:'),
    b('scene_heading', 'EXT. ROCKY COAST - NIGHT'),
    b('action', 'Rain hammers a lonely lighthouse. Its beam sweeps the black water.'),
    b('scene_heading', 'INT. LIGHTHOUSE - LAMP ROOM - CONTINUOUS'),
    b('action', 'MARA (60s), oilskin coat, wipes condensation from the glass.'),
    b('character', 'Mara'),
    b('parenthetical', '(to herself)'),
    b('dialogue', 'Forty years and you still find a way in.'),
    b('action', 'A RADIO crackles to life.'),
    b('character', 'Radio'),
    b('parenthetical', '(filtered)'),
    b('dialogue', 'Point Hollis, do you copy? We have a vessel adrift.'),
  ],
};
