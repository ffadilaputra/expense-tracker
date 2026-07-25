import type { Transaction } from '../types';

export interface DateGroup {
  /** ISO calendar date (yyyy-mm-dd). */
  date: string;
  items: Transaction[];
}

/**
 * Group transactions by their calendar date. Groups are ordered newest date
 * first; within a group, rows are ordered by createdAt so the most recently
 * entered transaction sits on top even when several share a date.
 */
export function groupByDate(txns: Transaction[]): DateGroup[] {
  const byDate = new Map<string, Transaction[]>();
  for (const t of txns) {
    const bucket = byDate.get(t.date);
    if (bucket) bucket.push(t);
    else byDate.set(t.date, [t]);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, items]) => ({
      date,
      items: items.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    }));
}

/** Compares two ISO dates as "today", "yesterday", or neither. */
export function relativeDay(dateISO: string, todayISO: string): 'today' | 'yesterday' | null {
  if (dateISO === todayISO) return 'today';
  const yesterday = new Date(`${todayISO}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dateISO === yesterday.toISOString().slice(0, 10)) return 'yesterday';
  return null;
}
