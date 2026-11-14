import { Script, plainBlock } from './model';

/** A sample block with a margin note explaining the format (shown at Beginner and Intermediate). */
const b = (type: string, text: string, note?: string) => ({ ...plainBlock(type, text), ...(note && { note }) });

export const sampleScreenplay: Script = {
  docType: 'screenplay',
  titlePage: { title: 'The Lighthouse Keeper', credit: 'Written by', author: 'Your Name', source: '', draftDate: '', contact: '' },
  blocks: [
    b('transition', 'FADE IN:', 'Transition. Many scripts open with FADE IN: and end with FADE OUT.'),
    b('scene_heading', 'EXT. ROCKY COAST - NIGHT', 'Scene heading: EXT. means outside, then the place, then the time of day.'),
    b('action', 'Rain hammers a lonely lighthouse. Its beam sweeps the black water.', 'Action: what we see and hear, in the present tense. Keep paragraphs short.'),
    b('scene_heading', 'INT. LIGHTHOUSE - LAMP ROOM - CONTINUOUS', 'A room inside a place: LIGHTHOUSE - LAMP ROOM. CONTINUOUS means no time has passed.'),
    b('action', 'MARA (60s), oilskin coat, wipes condensation from the glass.', 'The first time we meet a character, their name is in CAPITALS, often with an age.'),
    b('character', 'Mara', 'Character: who speaks. It always prints in capitals.'),
    b('parenthetical', '(to herself)', 'Parenthetical: a few words on how the line is said. Use them sparingly.'),
    b('dialogue', 'Forty years and you still find a way in.', 'Dialogue: the words spoken, under the name.'),
    b('action', 'A RADIO crackles to life.', 'Important sounds and objects can be capitalised so the crew notices them.'),
    b('character', 'Radio'),
    b('parenthetical', '(filtered)'),
    b('dialogue', 'Point Hollis, do you copy? We have a vessel adrift.'),
  ],
};
