import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACCENT,
  PRESET_ACCENTS,
  SURFACE,
  contrastRatio,
  onAccent,
  parseHex,
  readableOn,
  relativeLuminance,
  themeVars,
  toHex
} from './theme';

const rgb = (hex: string) => parseHex(hex)!;

describe('parseHex', () => {
  it('reads six-digit hex with or without the hash', () => {
    expect(parseHex('#2a78d6')).toEqual({ r: 42, g: 120, b: 214 });
    expect(parseHex('2a78d6')).toEqual({ r: 42, g: 120, b: 214 });
  });

  it('expands three-digit shorthand', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('returns null for anything malformed, rather than a partial colour', () => {
    for (const bad of ['', '#', 'nope', '#12345', '#gggggg', 'rgb(0,0,0)']) {
      expect(parseHex(bad)).toBeNull();
    }
  });
});

describe('toHex', () => {
  it('round-trips a parsed colour', () => {
    expect(toHex(rgb('#2a78d6'))).toBe('#2a78d6');
  });

  it('clamps and rounds out-of-range channels', () => {
    expect(toHex({ r: -20, g: 300, b: 127.6 })).toBe('#00ff80');
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance(rgb('#000000'))).toBeCloseTo(0, 6);
    expect(relativeLuminance(rgb('#ffffff'))).toBeCloseTo(1, 6);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black against white', () => {
    expect(contrastRatio(rgb('#000000'), rgb('#ffffff'))).toBeCloseTo(21, 5);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio(rgb('#2a78d6'), rgb('#2a78d6'))).toBeCloseTo(1, 6);
  });

  it('does not depend on argument order', () => {
    const a = rgb('#2a78d6');
    const b = rgb('#ffffff');
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe('onAccent', () => {
  it('puts white on a dark accent and near-black on a light one', () => {
    expect(onAccent('#111111')).toBe('#ffffff');
    expect(onAccent('#1b6b4a')).toBe('#ffffff');
    expect(onAccent('#eda100')).toBe('#111111');
    expect(onAccent('#ffff00')).toBe('#111111');
  });

  it('always picks the higher-contrast of the two', () => {
    for (const accent of [...PRESET_ACCENTS, '#eda100', '#888888', '#7f7f7f', '#ffffff', '#000000']) {
      const chosen = rgb(onAccent(accent));
      const other = onAccent(accent) === '#ffffff' ? rgb('#111111') : rgb('#ffffff');
      expect(contrastRatio(rgb(accent), chosen)).toBeGreaterThanOrEqual(
        contrastRatio(rgb(accent), other)
      );
    }
  });

  it('falls back to white for malformed input rather than throwing', () => {
    expect(onAccent('not a colour')).toBe('#ffffff');
  });
});

describe('readableOn', () => {
  it('leaves a colour alone when it already passes', () => {
    expect(readableOn('#111111', SURFACE.light)).toBe('#111111');
  });

  it('darkens a pale accent until it is legible on a light surface', () => {
    const out = readableOn('#eda100', SURFACE.light);
    expect(out).not.toBe('#eda100');
    expect(contrastRatio(rgb(out), rgb(SURFACE.light))).toBeGreaterThanOrEqual(4.5);
  });

  it('lightens a dark accent until it is legible on a dark surface', () => {
    const out = readableOn('#111111', SURFACE.dark);
    expect(contrastRatio(rgb(out), rgb(SURFACE.dark))).toBeGreaterThanOrEqual(4.5);
  });

  it('converges for pure yellow on white, the worst case', () => {
    const out = readableOn('#ffff00', SURFACE.light);
    expect(contrastRatio(rgb(out), rgb(SURFACE.light))).toBeGreaterThanOrEqual(4.5);
  });

  it('reaches 4.5:1 for every preset in both modes', () => {
    for (const accent of PRESET_ACCENTS) {
      for (const mode of ['light', 'dark'] as const) {
        const out = readableOn(accent, SURFACE[mode]);
        expect(contrastRatio(rgb(out), rgb(SURFACE[mode]))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('is idempotent - adjusting an adjusted colour changes nothing', () => {
    const once = readableOn('#eda100', SURFACE.light);
    expect(readableOn(once, SURFACE.light)).toBe(once);
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(readableOn('nope', SURFACE.light)).toBe('nope');
  });
});

describe('themeVars', () => {
  it('derives all three tokens from one colour', () => {
    const vars = themeVars('#2a5fd6', 'light');
    expect(vars['--accent']).toBe('#2a5fd6');
    expect(vars['--on-accent']).toBe('#ffffff');
    expect(contrastRatio(rgb(vars['--accent-strong']), rgb(SURFACE.light))).toBeGreaterThanOrEqual(4.5);
  });

  it('resolves accent-strong per mode, since legibility depends on the surface', () => {
    const light = themeVars('#111111', 'light');
    const dark = themeVars('#111111', 'dark');
    expect(light['--accent-strong']).not.toBe(dark['--accent-strong']);
  });

  it('falls back to the default accent for malformed input', () => {
    expect(themeVars('#zzz', 'light')['--accent']).toBe(DEFAULT_ACCENT);
  });

  it('never emits a value containing NaN', () => {
    for (const input of ['', '#', 'rgb(1,2,3)', '#12345']) {
      for (const v of Object.values(themeVars(input, 'light'))) {
        expect(v).not.toContain('NaN');
      }
    }
  });
});

describe('the pre-paint script agrees with themeVars', () => {
  // Mirrors the inline script in index.html. If the two ever diverge the page
  // would paint one accent and then swap to another once React mounted.
  function inlineOnAccent(accent: string): string {
    const n = parseInt(accent.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05499 ? '#ffffff' : '#111111';
  }

  it('picks the same on-accent for every preset and some awkward colours', () => {
    for (const accent of [...PRESET_ACCENTS, '#eda100', '#ffff00', '#7f7f7f', '#808080', '#2a78d6']) {
      expect(inlineOnAccent(accent)).toBe(onAccent(accent));
    }
  });
});
