import { filterByPeriod, type Period } from '../../utils/period';
import { computeTotals } from '../../utils/summary';
import { buildBreakdown, type Breakdown } from '../transactions/categoryBreakdown';
import type { Locale } from '../../i18n/locale';
import type { Transaction } from '../../types';

/** One column of the trend chart: a month of a year, or a day of a month. */
export interface TrendBucket {
  /** Axis label - 'Jan'..'Dec' for a year, '1'..'31' for a month. */
  label: string;
  income: number;
  expense: number;
}

/**
 * Everything the report shows, computed once. The screen and the PDF both read
 * this value rather than each recomputing from transactions, so the document
 * and the display cannot disagree about a figure.
 */
export interface ReportData {
  period: Period;
  totals: { income: number; expense: number; net: number };
  /** Empty for a single day: one bar is not a chart. */
  buckets: TrendBucket[];
  breakdown: Breakdown;
  /** The in-period transactions, newest first, for the PDF's table. */
  rows: Transaction[];
}

/**
 * Days in a 'YYYY-MM' key. Day 0 of the following month is the last day of this
 * one, which gets February and leap years right without a rule of its own.
 * UTC throughout so a machine west of Greenwich cannot shift the boundary.
 */
export function daysInMonth(key: string): number {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Short month names in the active locale, January first. */
function monthLabels(locale: Locale): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2026, i, 1))));
}

/**
 * Buckets are allocated up front and filled by index rather than grouped from
 * the data, which is what keeps empty months and empty days on the axis. A year
 * that only saw spending in January should read as a mostly empty year, not as
 * a one-column chart.
 */
function bucketsFor(scoped: Transaction[], period: Period, locale: Locale): TrendBucket[] {
  if (period.kind === 'date') return [];

  const size = period.kind === 'year' ? 12 : daysInMonth(period.key);
  const labels =
    period.kind === 'year'
      ? monthLabels(locale)
      : Array.from({ length: size }, (_, i) => String(i + 1));
  const buckets: TrendBucket[] = labels.map((label) => ({ label, income: 0, expense: 0 }));

  for (const t of scoped) {
    // 'YYYY-MM-DD': the month is chars 5-7, the day 8-10. Both are 1-based.
    const index = Number(period.kind === 'year' ? t.date.slice(5, 7) : t.date.slice(8, 10)) - 1;
    if (index < 0 || index >= size) continue;
    if (t.type === 'income') buckets[index].income += t.amount;
    else buckets[index].expense += t.amount;
  }

  return buckets;
}

export function buildReport(txns: Transaction[], period: Period, locale: Locale): ReportData {
  const scoped = filterByPeriod(txns, period);
  const { income, expense } = computeTotals(scoped);

  return {
    period,
    totals: { income, expense, net: income - expense },
    buckets: bucketsFor(scoped, period, locale),
    breakdown: buildBreakdown(scoped),
    // Copied before sorting: `scoped` is a fresh array from filterByPeriod, but
    // relying on that would make this fragile if the filter ever short-circuits
    // and returns its input.
    rows: [...scoped].sort((a, b) =>
      b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAt.localeCompare(a.createdAt)
    )
  };
}
