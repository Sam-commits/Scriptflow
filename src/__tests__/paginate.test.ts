import { describe, expect, it } from 'vitest';
import { screenplay } from '../doctypes/screenplay';
import { LINES_PER_PAGE, Line, paginate, wrapRuns } from '../io/paginate';
import { plainBlock as b } from '../model';

const text = (l: Line | null) => (l ? l.segments.map((s) => s.text).join('') : '');

describe('wrapRuns', () => {
  it('wraps at spaces within the width and keeps styles', () => {
    const lines = wrapRuns([{ text: 'hello ' }, { text: 'big world', bold: true }], 9);
    expect(lines.map((l) => l.map((s) => s.text).join(''))).toEqual(['hello big', 'world']);
    expect(lines[1][0].bold).toBe(true);
  });
});

describe('paginate', () => {
  it('fits a short script on one page', () => {
    const pages = paginate(screenplay, [b('scene_heading', 'INT. A - DAY'), b('action', 'Hi.')]);
    expect(pages).toHaveLength(1);
    expect(text(pages[0][0])).toBe('INT. A - DAY');
    expect(pages[0][1]).toBeNull();
  });

  it('never leaves a scene heading at the bottom of a page', () => {
    const filler = Array.from({ length: 26 }, () => b('action', 'x'));
    // 26 actions = 51 lines; heading would land on lines 53, with no room for its action.
    const pages = paginate(screenplay, [...filler, b('scene_heading', 'INT. B - DAY'), b('action', 'y')]);
    expect(pages).toHaveLength(2);
    expect(text(pages[1][0])).toBe('INT. B - DAY');
  });

  it("splits long dialogue with (MORE) and (CONT'D)", () => {
    const filler = Array.from({ length: 24 }, () => b('action', 'x'));
    const long = Array.from({ length: 12 }, (_, i) => `Line number ${i} of a long speech.`).join(' ');
    const pages = paginate(screenplay, [...filler, b('character', 'Mara'), b('dialogue', long)]);
    expect(pages).toHaveLength(2);
    const p1 = pages[0];
    expect(p1.length).toBeLessThanOrEqual(LINES_PER_PAGE);
    expect(text(p1[p1.length - 1])).toBe('(MORE)');
    expect(text(pages[1][0])).toBe("MARA (CONT'D)");
  });
});
