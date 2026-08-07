import type { Transaction } from '../../types';

export interface DateGroup {
  /** ISO calendar date (yyyy-mm-dd). */
  date: string;
  items: Transaction[];
}

const desc = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0);

/**
 * Newest first: by calendar date, then by createdAt so the most recently
 * entered transaction sits on top even when several share a date.
 */
export function compareNewestFirst(a: Transaction, b: Transaction): number {
  return desc(a.date, b.date) || desc(a.createdAt, b.createdAt);
}

/**
 * A copy of `txns` in display order.
 *
 * The store hands transactions over in sheet order, which is append order, so
 * anything that takes a prefix of the list - paging above all - has to sort
 * first or it takes the oldest rows. Grouping alone is not enough: it only
 * orders what it is given.
 */
export function sortNewestFirst(txns: Transaction[]): Transaction[] {
  return txns.slice().sort(compareNewestFirst);
}

/**
 * Group transactions by their calendar date. Groups are ordered newest date
 * first, and rows within a group follow the same order.
 */
export function groupByDate(txns: Transaction[]): DateGroup[] {
  const byDate = new Map<string, Transaction[]>();
  for (const t of txns) {
    const bucket = byDate.get(t.date);
    if (bucket) bucket.push(t);
    else byDate.set(t.date, [t]);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => desc(a[0], b[0]))
    .map(([date, items]) => ({ date, items: sortNewestFirst(items) }));
}

/** Compares two ISO dates as "today", "yesterday", or neither. */
export function relativeDay(dateISO: string, todayISO: string): 'today' | 'yesterday' | null {
  if (dateISO === todayISO) return 'today';
  const yesterday = new Date(`${todayISO}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dateISO === yesterday.toISOString().slice(0, 10)) return 'yesterday';
  return null;
}

/**
 * Weekday name for a calendar date, e.g. "Saturday" / "Sabtu".
 *
 * Parsed and formatted in UTC on purpose: the stored value is a calendar date
 * with no time, so reading it in the local zone would shift it a day backwards
 * for anyone west of UTC and name the wrong weekday.
 */
export function weekdayName(dateISO: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${dateISO}T00:00:00Z`)
  );
}

/** Day and month for a calendar date, e.g. "Aug 1" / "1 Agu". */
export function shortDate(dateISO: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${dateISO}T00:00:00Z`)
  );
}
