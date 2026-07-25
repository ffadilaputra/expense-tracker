// Kept separate from the React context (context.tsx) so plain modules that
// aren't components - like sheetApi.ts's error messages - can read the
// current language without needing a hook.

export type Locale = 'en' | 'id';

const LOCALE_KEY = 'finance:locale';

/** English is the default/primary language, per the app's requirements. */
const DEFAULT_LOCALE: Locale = 'en';

export function getStoredLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'id' ? 'id' : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Not critical - the choice just won't persist across reloads.
  }
}
