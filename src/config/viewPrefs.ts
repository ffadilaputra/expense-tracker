// Transaction-page view preferences. Stored like the theme and locale rather
// than in the sheet: they describe how this browser shows the data, not the
// data itself.

import { normalizeView, type View } from '../features/transactions/views';

const VIEWS_KEY = 'finance:views';
const INSIGHTS_KEY = 'finance:insights-open';

export function loadViews(): View[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeView).filter((v): v is View => v !== null);
  } catch {
    // Unparseable or unreadable storage: start from no views rather than
    // failing the screen that renders them.
    return [];
  }
}

export function saveViews(views: View[]): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Private browsing; the views apply for this session and are not kept.
  }
}

/** Closed by default - that default is what shortens the page. */
export function loadInsightsOpen(): boolean {
  try {
    return localStorage.getItem(INSIGHTS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveInsightsOpen(open: boolean): void {
  try {
    localStorage.setItem(INSIGHTS_KEY, open ? '1' : '0');
  } catch {
    // As above.
  }
}
