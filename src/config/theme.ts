import { DEFAULT_ACCENT, themeVars, type Appearance } from '../utils/theme';

// Device preferences, stored like the locale rather than in the sheet: they
// describe this browser, not the user's finances.
const ACCENT_KEY = 'finance:accent';
const APPEARANCE_KEY = 'finance:appearance';

export function getStoredAccent(): string {
  try {
    return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function setStoredAccent(hex: string): void {
  try {
    localStorage.setItem(ACCENT_KEY, hex);
  } catch {
    // Private browsing; the choice applies for this session and is not kept.
  }
}

export function getStoredAppearance(): Appearance {
  try {
    const value = localStorage.getItem(APPEARANCE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function setStoredAppearance(mode: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, mode);
  } catch {
    // As above.
  }
}

/**
 * Resolves what the page is actually showing, which is what `--accent-strong`
 * has to be legible against - "system" is not a surface.
 */
function resolvedMode(appearance: Appearance): 'light' | 'dark' {
  if (appearance !== 'system') return appearance;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(accent: string, appearance: Appearance): void {
  const root = document.documentElement;

  if (appearance === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', appearance);

  // The default accent is the stylesheet's own, and it differs per mode.
  // Leaving the attribute off lets those defaults stand rather than pinning
  // the light value into dark mode.
  if (accent === DEFAULT_ACCENT) {
    root.removeAttribute('data-accent');
    for (const name of ['--accent', '--on-accent', '--accent-strong']) {
      root.style.removeProperty(name);
    }
    return;
  }

  root.setAttribute('data-accent', '');
  for (const [name, value] of Object.entries(themeVars(accent, resolvedMode(appearance)))) {
    root.style.setProperty(name, value);
  }
}
