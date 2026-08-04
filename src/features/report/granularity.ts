import { monthKey, type Period } from '../../utils/period';

export type Granularity = 'year' | 'month' | 'day';

export function granularityOf(period: Period): Granularity {
  if (period.kind === 'year') return 'year';
  if (period.kind === 'month') return 'month';
  return 'day';
}

function yearOf(period: Period): string {
  if (period.kind === 'year') return period.year;
  if (period.kind === 'month') return period.key.slice(0, 4);
  return period.date.slice(0, 4);
}

/** `months` is newest-first, per availableMonths, so [0] is the latest. */
function monthOf(period: Period, months: string[]): string {
  if (period.kind === 'month') return period.key;
  if (period.kind === 'date') return monthKey(period.date);
  const inYear = months.filter((key) => key.startsWith(`${period.year}-`));
  return inYear.length > 0 ? inYear[0] : `${period.year}-01`;
}

function dayOf(period: Period, todayISO: string): string {
  const first =
    period.kind === 'date'
      ? period.date
      : period.kind === 'month'
        ? `${period.key}-01`
        : `${period.year}-01-01`;
  // The day input carries max={todayISO}; handing it a later value would show a
  // date the control itself rejects.
  return first > todayISO ? todayISO : first;
}

/**
 * Where the user lands when they change granularity. The rule throughout is to
 * stay near where they already were - switching to Month from a year opens that
 * year's most recent month with data, not January and not today. Landing
 * somewhere unrelated after one tap is the thing worth avoiding.
 */
export function switchGranularity(
  period: Period,
  to: Granularity,
  months: string[],
  todayISO: string
): Period {
  if (to === 'year') return { kind: 'year', year: yearOf(period) };
  if (to === 'month') return { kind: 'month', key: monthOf(period, months) };
  return { kind: 'date', date: dayOf(period, todayISO) };
}

/** The period as it appears in an export filename. */
export function periodSlug(period: Period): string {
  if (period.kind === 'year') return period.year;
  if (period.kind === 'month') return period.key;
  return period.date;
}
