// Instead of baking a single Google Sheet URL into the build via .env, each
// user "connects" their own Apps Script Web App URL once, on their own
// device. This means one deployed build of the app can be reused by anyone
// with their own Google Sheet - the connection lives entirely client-side.

const API_URL_KEY = 'finance:api-url';

export function getStoredApiUrl(): string | null {
  try {
    return localStorage.getItem(API_URL_KEY);
  } catch {
    return null;
  }
}

export function setStoredApiUrl(url: string): void {
  localStorage.setItem(API_URL_KEY, url);
}

export function clearStoredApiUrl(): void {
  localStorage.removeItem(API_URL_KEY);
}

/** Cheap client-side sanity check before we bother making a network request. */
export function isValidAppsScriptUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'script.google.com' && parsed.pathname.endsWith('/exec');
  } catch {
    return false;
  }
}
