import type { Allocation } from '../../types';

/** One refill window, both ends inclusive ISO dates. */
export interface AllocationPeriod {
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

/**
 * All date arithmetic goes through UTC. A local-time Date would shift by an
 * hour across a DST boundary and round a day-count to the wrong integer -
 * the same reason period.ts pins its month formatting to UTC.
 */
function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return toISO(toUTC(iso) + days * DAY_MS);
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * `months` after `iso`, holding the day-of-month at `anchorDay` and clamping
 * to the last day of a shorter month. Without the clamp a 31st-anchored
 * envelope would skip February entirely by rolling into March.
 */
function addMonths(iso: string, months: number, anchorDay: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12; // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(anchorDay, lastDay))}`;
}

/** How many days one period spans. Monthly does not use this. */
function intervalDays(allocation: Allocation): number {
  if (allocation.cadence === 'weekly') return 7;
  if (allocation.cadence === 'days') {
    const n = Math.floor(allocation.intervalDays ?? 1);
    return n >= 1 ? n : 1;
  }
  return 1;
}

const anchorDayOf = (allocation: Allocation): number =>
  Number(allocation.startDate.slice(8, 10));

/**
 * Periods that have begun on or before today, counting the start date itself
 * as period 1. Zero when the envelope has not started yet, so a future start
 * date grants nothing rather than borrowing against itself.
 */
export function periodsElapsed(allocation: Allocation, todayISO: string): number {
  if (todayISO < allocation.startDate) return 0;

  if (allocation.cadence === 'monthly') {
    const [sy, sm] = allocation.startDate.split('-').map(Number);
    const [ty, tm] = todayISO.split('-').map(Number);
    const monthsApart = (ty - sy) * 12 + (tm - sm);
    const anchor = addMonths(allocation.startDate, monthsApart, anchorDayOf(allocation));
    return monthsApart + (todayISO >= anchor ? 1 : 0);
  }

  return Math.floor(daysBetween(allocation.startDate, todayISO) / intervalDays(allocation)) + 1;
}

/**
 * The window containing today. Before the envelope starts this reports the
 * first period, so the detail modal always has a window to name.
 */
export function currentPeriod(allocation: Allocation, todayISO: string): AllocationPeriod {
  const index = Math.max(0, periodsElapsed(allocation, todayISO) - 1);

  if (allocation.cadence === 'monthly') {
    const day = anchorDayOf(allocation);
    const start = addMonths(allocation.startDate, index, day);
    const next = addMonths(allocation.startDate, index + 1, day);
    return { start, end: addDays(next, -1) };
  }

  const span = intervalDays(allocation);
  const start = addDays(allocation.startDate, index * span);
  return { start, end: addDays(start, span - 1) };
}
