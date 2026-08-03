// Whether the transactions page opens with the Insights panel expanded.
// Stored like the theme and locale rather than in the sheet: it describes how
// this browser shows the data, not the data itself.

const INSIGHTS_KEY = 'finance:insights-open';

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
    // Private browsing; the choice applies for this session and is not kept.
  }
}
