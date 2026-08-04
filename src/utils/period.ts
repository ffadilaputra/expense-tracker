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

export interface YearPeriod {
  kind: 'year';
  /** 'YYYY' */
  year: string;
}

export type Period = YearPeriod | MonthPeriod | DatePeriod;

/**
 * The two kinds the transactions screen works in. Years are reachable only from
 * the report, so the components on that screen take this narrower type rather
 * than carrying a branch for a period they are never handed.
 */
export type MonthOrDatePeriod = MonthPeriod | DatePeriod;

/** Year+month prefix of an ISO date, e.g. "2026-07-25" -> "2026-07". */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Year prefix of an ISO date, e.g. "2026-07-25" -> "2026". */
export function yearKey(isoDate: string): string {
  return isoDate.slice(0, 4);
}

export function currentYear(todayISO: string): YearPeriod {
  return { kind: 'year', year: yearKey(todayISO) };
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

/** Month key rendered for people, e.g. "March 2026" / "Maret 2026". */
export function monthName(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${key}-01T00:00:00Z`));
}

/**
 * Months the user can actually navigate to: every month containing a
 * transaction, plus the current one so a new sheet is not empty, newest first.
 *
 * Offering only months with data keeps the list short and honest - an empty
 * month is reachable in principle but there would be nothing in it to see.
 * Future months are excluded even if a transaction is dated ahead, since the
 * period bar is for reviewing what has happened.
 */
export function availableMonths(txns: Transaction[], todayISO: string): string[] {
  const thisMonth = monthKey(todayISO);
  const keys = new Set<string>([thisMonth]);
  for (const t of txns) {
    const key = monthKey(t.date);
    if (key <= thisMonth) keys.add(key);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}

/**
 * Years the report can scope to: every year containing a transaction, plus the
 * current one so a new sheet is not empty, newest first. Future years are left
 * out for the same reason months are - a report is for what has happened.
 */
export function availableYears(txns: Transaction[], todayISO: string): string[] {
  const thisYear = yearKey(todayISO);
  const keys = new Set<string>([thisYear]);
  for (const t of txns) {
    const key = yearKey(t.date);
    if (key <= thisYear) keys.add(key);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function filterByPeriod(txns: Transaction[], period: Period): Transaction[] {
  if (period.kind === 'date') return txns.filter((t) => t.date === period.date);
  if (period.kind === 'year') return txns.filter((t) => yearKey(t.date) === period.year);
  return txns.filter((t) => monthKey(t.date) === period.key);
}
