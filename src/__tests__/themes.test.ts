import { describe, expect, it } from 'vitest';
import { getDocType } from '../doctypes';
import { screenplay } from '../doctypes/screenplay';
import { toFdx, toFountain } from '../io/files';
import { paginate, pageStarts } from '../io/paginate';
import { scriptToPdf } from '../io/pdf';
import { plainBlock as b } from '../model';
import { sampleScreenplay } from '../sample';
import { contrast } from '../themes/contrast';
import {
  DEFAULT_APPEARANCE, accents, applyAppearance, builtinThemes, normalize, resolveMode, themeTokens, tokensToCss,
} from '../themes';

const AA = 4.5;

describe('built-in themes', () => {
  it('has three light and three dark themes', () => {
    expect(builtinThemes.filter((t) => t.mode === 'light').map((t) => t.id)).toEqual(['paper', 'manuscript', 'high-contrast']);
    expect(builtinThemes.filter((t) => t.mode === 'dark').map((t) => t.id)).toEqual(['night', 'midnight', 'dark-desk']);
  });

  for (const t of builtinThemes) {
    it(`${t.name} meets WCAG AA contrast`, () => {
      const k = t.tokens;
      expect(contrast(k.pageText, k.page)).toBeGreaterThanOrEqual(AA);
      expect(contrast(k.text, k.panel)).toBeGreaterThanOrEqual(AA);
      expect(contrast(k.text, k.bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(k.muted, k.panel)).toBeGreaterThanOrEqual(AA);
      expect(contrast(k.onAccent, k.accent)).toBeGreaterThanOrEqual(AA);
      expect(contrast(k.accent, k.accentSoft)).toBeGreaterThanOrEqual(AA);
      expect(contrast(k.error, k.errorSoft)).toBeGreaterThanOrEqual(AA);
    });
  }

  for (const a of accents) {
    it(`${a.name} accent meets AA in every theme`, () => {
      for (const t of builtinThemes) {
        const acc = a[t.mode];
        expect(contrast(acc.onAccent, acc.accent), `${t.name} button`).toBeGreaterThanOrEqual(AA);
        expect(contrast(acc.accent, acc.accentSoft), `${t.name} badge`).toBeGreaterThanOrEqual(AA);
        expect(contrast(acc.accent, t.tokens.panel), `${t.name} brand`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe('appearance settings', () => {
  it('follows the system by default', () => {
    expect(resolveMode(DEFAULT_APPEARANCE, true)).toBe('dark');
    expect(resolveMode(DEFAULT_APPEARANCE, false)).toBe('light');
    expect(resolveMode({ ...DEFAULT_APPEARANCE, mode: 'light' }, true)).toBe('light');
  });

  it('repairs bad or missing saved values', () => {
    expect(normalize(null)).toEqual(DEFAULT_APPEARANCE);
    const s = normalize({ mode: 'purple' as never, zoom: 9, pageView: 'nope' as never, darkTheme: 'midnight' });
    expect(s.mode).toBe('system');
    expect(s.zoom).toBe(2);
    expect(s.pageView).toBe('paged');
    expect(s.darkTheme).toBe('midnight');
    expect(normalize({ zoom: 'fit' }).zoom).toBe('fit');
  });

  it('applies an accent over the theme', () => {
    const t = themeTokens({ ...DEFAULT_APPEARANCE, accent: 'blue' }, 'light');
    expect(t.accent).toBe(accents.find((a) => a.id === 'blue')!.light.accent);
    expect(t.page).toBe('#ffffff');
  });

  it('writes CSS variables onto the root element', () => {
    const root = document.createElement('div');
    const mode = applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'dark', darkTheme: 'midnight' }, false, root);
    expect(mode).toBe('dark');
    expect(root.style.getPropertyValue('--page')).toBe('#0d0d0f');
    expect(root.style.getPropertyValue('--panel-border')).toBe('#26252b');
    expect(root.dataset.theme).toBe('dark');
    expect(tokensToCss(themeTokens(DEFAULT_APPEARANCE, 'light'), 'light')).toContain('color-scheme:light');
  });
});

describe('exports ignore appearance', () => {
  it('produces identical PDF, FDX and Fountain under every theme', () => {
    const exportAll = () => {
      const pdf = scriptToPdf(sampleScreenplay);
      pdf.setCreationDate(new Date(0));
      pdf.setFileId('00000000000000000000000000000000');
      return [pdf.output(), toFdx(sampleScreenplay), toFountain(sampleScreenplay)];
    };
    const baseline = exportAll();
    for (const t of builtinThemes) {
      for (const accent of ['theme', 'violet']) {
        applyAppearance({ ...DEFAULT_APPEARANCE, mode: t.mode, lightTheme: t.id, darkTheme: t.id, accent, pageView: 'draft', zoom: 2 }, false);
        expect(exportAll()).toEqual(baseline);
      }
    }
  });
});

describe('pageStarts', () => {
  it('is empty for a one-page script', () => {
    expect(pageStarts(screenplay, [b('scene_heading', 'INT. A - DAY'), b('action', 'Hi.')])).toEqual([]);
  });

  it('marks the block that opens each later page', () => {
    const filler = Array.from({ length: 26 }, () => b('action', 'x'));
    const blocks = [...filler, b('scene_heading', 'INT. B - DAY'), b('action', 'y')];
    expect(pageStarts(screenplay, blocks)).toEqual([{ block: 26, mid: false }]);
  });

  it('flags a page that starts partway through a speech', () => {
    const filler = Array.from({ length: 24 }, () => b('action', 'x'));
    const long = Array.from({ length: 12 }, (_, i) => `Line number ${i} of a long speech.`).join(' ');
    expect(pageStarts(screenplay, [...filler, b('character', 'Mara'), b('dialogue', long)])).toEqual([{ block: 25, mid: true }]);
  });

  it('agrees with paginate on page count for the sample', () => {
    const dt = getDocType(sampleScreenplay.docType);
    expect(pageStarts(dt, sampleScreenplay.blocks).length).toBe(paginate(dt, sampleScreenplay.blocks).length - 1);
  });
});
