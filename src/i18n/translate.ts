import type { Locale } from './locale';
import { translations, type TranslationKey } from './translations';

/**
 * Looks up `key` in the given locale and substitutes any `{param}`
 * placeholders. Deliberately simple string replacement instead of an ICU
 * message format parser - the app only ever needs single-value
 * interpolation (a count, a status code, an action name), so a tiny
 * `.split().join()` loop covers it with no parsing cost at runtime.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  let text: string = translations[locale][key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
