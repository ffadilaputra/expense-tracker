export type Appearance = 'system' | 'light' | 'dark';

/** The stylesheet's own surfaces, needed to check contrast against them. */
export const SURFACE = { light: '#ffffff', dark: '#0f1113' } as const;

export const DEFAULT_ACCENT = '#111111';

/** Offered as swatches. The first is the app's original near-black. */
export const PRESET_ACCENTS = [
  '#111111',
  '#1b6b4a',
  '#2a5fd6',
  '#a2542b',
  '#4a3aa7',
  '#a32f4f'
] as const;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Returns null rather than a partial colour, so callers must handle bad input. */
export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let body = m[1];
  if (body.length === 3) body = body.split('').map((c) => c + c).join('');
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16)
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const NEAR_BLACK: Rgb = { r: 17, g: 17, b: 17 };

/**
 * The text colour to put on top of `accent`: whichever of white or near-black
 * has more contrast against it. This is what stops a mid-tone accent making
 * the FAB's plus sign or a primary button's label disappear.
 */
export function onAccent(accent: string): string {
  const rgb = parseHex(accent);
  if (!rgb) return '#ffffff';
  return contrastRatio(rgb, WHITE) >= contrastRatio(rgb, NEAR_BLACK) ? '#ffffff' : '#111111';
}

function mixToward(rgb: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: rgb.r + (target.r - rgb.r) * amount,
    g: rgb.g + (target.g - rgb.g) * amount,
    b: rgb.b + (target.b - rgb.b) * amount
  };
}

/**
 * A version of `accent` that is legible *as text* on `background`.
 *
 * Steps the colour toward black on a light surface, or toward white on a dark
 * one, until it clears 4.5:1. Returns the accent untouched when it already
 * passes, so a well-chosen colour is never dulled. Pure yellow on white is the
 * case that needs the most steps and still terminates: the loop is bounded and
 * the endpoint (black or white) always passes.
 */
export function readableOn(accent: string, background: string, minRatio = 4.5): string {
  const rgb = parseHex(accent);
  const bg = parseHex(background);
  if (!rgb || !bg) return accent;
  if (contrastRatio(rgb, bg) >= minRatio) return toHex(rgb);

  const target = relativeLuminance(bg) > 0.5 ? { r: 0, g: 0, b: 0 } : WHITE;
  for (let step = 1; step <= 20; step++) {
    const candidate = mixToward(rgb, target, step / 20);
    if (contrastRatio(candidate, bg) >= minRatio) return toHex(candidate);
  }
  return toHex(target);
}

export interface ThemeVars {
  '--accent': string;
  '--on-accent': string;
  '--accent-strong': string;
}

/**
 * Every accent-derived custom property, for one appearance.
 *
 * `--accent-strong` is resolved per mode because "legible as text" depends on
 * what is behind it; the other two do not change between modes.
 */
export function themeVars(accent: string, mode: 'light' | 'dark'): ThemeVars {
  const safe = parseHex(accent) ? accent : DEFAULT_ACCENT;
  return {
    '--accent': toHex(parseHex(safe) as Rgb),
    '--on-accent': onAccent(safe),
    '--accent-strong': readableOn(safe, SURFACE[mode])
  };
}
