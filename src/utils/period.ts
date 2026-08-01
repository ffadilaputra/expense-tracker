import type { Transaction } from '../types';

/**
 * The slice of time the whole screen is scoped to: a calendar month, or one
 * specific day. Summary totals, the category chips, and the transaction list
 * all read from the same period so there is only ever one time filter active.
 */
export interface MonthPeriod {
  kind: 'month';
  /** 'YYYY-MM' */
  key: string;
}

export interface DatePeriod {
  kind: 'date';
  /** 'YYYY-MM-DD' */
  date: string;
}

export type Period = MonthPeriod | DatePeriod;

/** Year+month prefix of an ISO date, e.g. "2026-07-25" -> "2026-07". */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function currentMonth(todayISO: string): MonthPeriod {
  return { kind: 'month', key: monthKey(todayISO) };
}

/**
 * Arithmetic on the 'YYYY-MM' string rather than Date: the January -> December
 * rollover is the only special case, and there is no timezone to get wrong.
 */
export function previousMonth(todayISO: string): MonthPeriod {
  const [year, month] = monthKey(todayISO).split('-').map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return { kind: 'month', key: `${prevYear}-${String(prevMonth).padStart(2, '0')}` };
}

export function filterByPeriod(txns: Transaction[], period: Period): Transaction[] {
  if (period.kind === 'date') return txns.filter((t) => t.date === period.date);
  return txns.filter((t) => monthKey(t.date) === period.key);
}
