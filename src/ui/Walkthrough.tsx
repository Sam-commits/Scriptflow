import { DocTypeDef, getElement } from '../doctypes';
import { Block, blockText } from '../model';
import { SCENE_PREFIXES } from '../editor/smarttype';

interface Step { title: string; text: string; done: (dt: DocTypeDef, blocks: Block[]) => boolean }

const has = (blocks: Block[], dt: DocTypeDef, test: (b: Block, i: number) => boolean) => blocks.some(test);

export const TOUR_STEPS: Step[] = [
  {
    title: 'Start with a scene heading',
    text: 'Every scene starts with a heading: INT. (inside) or EXT. (outside), the place, then the time of day. Type / and choose Scene to build one, or type INT. and a place.',
    done: (dt, blocks) => has(blocks, dt, (b) => getElement(dt, b.type).smartType === 'sceneHeading'
      && SCENE_PREFIXES.some((p) => blockText(b).toUpperCase().startsWith(p)) && blockText(b).trim().length > 6),
  },
  {
    title: 'Describe what we see',
    text: 'That is Action: what the audience sees and hears, in the present tense. Write a line about the place or what someone is doing.',
    done: (dt, blocks) => has(blocks, dt, (b, i) => b.type === 'action' && !!blockText(b).trim()
      && blocks.slice(0, i).some((x) => getElement(dt, x.type).sceneStart)),
  },
  {
    title: 'Someone speaks',
    text: 'Press Enter for a new line, then Tab until the status bar says Character. Type the speaker’s name (it shows in capitals).',
    done: (dt, blocks) => has(blocks, dt, (b) => !!getElement(dt, b.type).speaker && !!blockText(b).trim()),
  },
  {
    title: 'What do they say?',
    text: 'Press Enter after the name. You are now in Dialogue: write their line.',
    done: (dt, blocks) => has(blocks, dt, (b, i) => b.type === 'dialogue' && !!blockText(b).trim()
      && blocks.slice(0, i).some((x) => !!getElement(dt, x.type).speaker)),
  },
];

/** The first-scene walk-through: a card that follows along as the writer builds a scene. */
export function Walkthrough({ dt, blocks, onClose }: { dt: DocTypeDef; blocks: Block[]; onClose: () => void }) {
  const step = TOUR_STEPS.findIndex((s) => !s.done(dt, blocks));
  const finished = step === -1;
  return (
    <aside className="tour" role="status" aria-live="polite">
      <div className="tour-head">
        <small>{finished ? 'First scene' : `First scene · step ${step + 1} of ${TOUR_STEPS.length}`}</small>
        <button type="button" className="link" onClick={onClose}>{finished ? 'Close' : 'Skip tour'}</button>
      </div>
      {finished ? (
        <>
          <h3>That’s a scene</h3>
          <p>Keep going: Enter always moves to the element that usually comes next, and Tab changes it. When you’re ready, Export → PDF in the top bar prints it in standard format.</p>
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </>
      ) : (
        <>
          <h3>{TOUR_STEPS[step].title}</h3>
          <p>{TOUR_STEPS[step].text}</p>
          <ol className="tour-dots" aria-hidden="true">
            {TOUR_STEPS.map((_, i) => <li key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
          </ol>
        </>
      )}
    </aside>
  );
}
