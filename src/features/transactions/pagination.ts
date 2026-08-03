/**
 * How many transactions the list reveals at a time. Pagination is a rendering
 * concern only - the summary, charts and heatmap keep reading the full period,
 * so no total changes because the user has not pressed "load more" yet.
 */
export const PAGE_SIZE = 30;

export interface Page<T> {
  rows: T[];
  /** How many items are still hidden. Never negative. */
  remaining: number;
  hasMore: boolean;
}

/**
 * The first `pages` pages of `items`, plus what is left over.
 *
 * `pages` is clamped at one so an unexpected 0 renders a page rather than an
 * empty list, and the slice is bounded by the array itself so a count past the
 * end degrades to "everything, nothing hidden".
 */
export function pageSlice<T>(items: T[], pages: number): Page<T> {
  const limit = Math.max(1, Math.floor(pages)) * PAGE_SIZE;
  const rows = items.slice(0, limit);
  const remaining = items.length - rows.length;
  return { rows, remaining, hasMore: remaining > 0 };
}
