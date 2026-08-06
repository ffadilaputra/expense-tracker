import type { Allocation, Transaction } from '../../types';

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

/**
 * How many days one period spans. Monthly does not use this.
 *
 * Exported so a `days` envelope can be labelled with the same clamped interval
 * its periods are cut on - a hand-typed 0 or 2.5 in the sheet must not let the
 * card name one cadence while the bar measures another.
 */
export function intervalDays(allocation: Allocation): number {
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

export interface AllocationSummary {
  periodStart: string;
  /** Inclusive. */
  periodEnd: string;
  periodsElapsed: number;
  granted: number;
  /** Since startDate, up to and including today. */
  spent: number;
  /** granted - spent. Negative when overdrawn. */
  available: number;
  spentThisPeriod: number;
  /** amount - spentThisPeriod. Negative when this period is overspent. */
  periodRemaining: number;
  isOverdrawn: boolean;
}

export interface AllocationRow {
  allocation: Allocation;
  summary: AllocationSummary;
}

/** The subset of a form that can invalidate an envelope's accumulated history. */
export type AllocationFormShape = Pick<
  Allocation,
  'amount' | 'cadence' | 'intervalDays' | 'categories'
>;

/**
 * Which categories each envelope actually owns.
 *
 * One category belongs to one envelope. The form prevents a conflict, but the
 * sheet is the user's own file and can be edited into one, so the first
 * claimant wins here too - by createdAt, then id, so the answer does not
 * depend on the order rows came back from the sheet.
 */
export function resolveClaims(allocations: Allocation[]): Map<string, string[]> {
  const ordered = [...allocations].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.id.localeCompare(b.id);
  });

  const owner = new Map<string, string>();
  const owned = new Map<string, string[]>();

  for (const allocation of ordered) {
    const mine: string[] = [];
    for (const raw of allocation.categories) {
      const category = raw.trim();
      if (category === '' || owner.has(category)) continue;
      owner.set(category, allocation.id);
      mine.push(category);
    }
    owned.set(allocation.id, mine);
  }

  return owned;
}

function summarize(
  allocation: Allocation,
  owned: string[],
  transactions: Transaction[],
  todayISO: string
): AllocationSummary {
  const { start: periodStart, end: periodEnd } = currentPeriod(allocation, todayISO);
  const elapsed = periodsElapsed(allocation, todayISO);
  const claimed = new Set(owned);

  // The current period may run past today; only count as far as today so
  // "spent this period" cannot include a future-dated row.
  const periodCap = periodEnd < todayISO ? periodEnd : todayISO;

  let spent = 0;
  let spentThisPeriod = 0;

  for (const t of transactions) {
    // Income is ignored on purpose: an envelope is a spending allowance, and
    // netting a refund into it would move "left today" for a reason the user
    // did not act on. Transfers are a separate collection and never reach here.
    if (t.type !== 'expense') continue;
    if (!claimed.has(t.category.trim())) continue;
    if (t.date < allocation.startDate || t.date > todayISO) continue;

    spent += t.amount;
    if (t.date >= periodStart && t.date <= periodCap) spentThisPeriod += t.amount;
  }

  const granted = allocation.openingBalance + elapsed * allocation.amount;
  const available = granted - spent;

  return {
    periodStart,
    periodEnd,
    periodsElapsed: elapsed,
    granted,
    spent,
    available,
    spentThisPeriod,
    periodRemaining: allocation.amount - spentThisPeriod,
    isOverdrawn: available < 0
  };
}

/**
 * One pass over every envelope, so the strip, the detail modal and the
 * unallocated line are always reading the same numbers.
 */
export function summarizeAllocations(
  allocations: Allocation[],
  transactions: Transaction[],
  todayISO: string
): AllocationRow[] {
  const owned = resolveClaims(allocations);
  return allocations.map((allocation) => ({
    allocation,
    summary: summarize(allocation, owned.get(allocation.id) ?? [], transactions, todayISO)
  }));
}

/** What the envelopes are still holding. Overdrawn ones hold nothing. */
export function totalAllocated(rows: AllocationRow[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.summary.available), 0);
}

export function unallocated(balance: number, rows: AllocationRow[]): number {
  return balance - totalAllocated(rows);
}

/**
 * Because `available` is computed from `startDate`, changing the rule would
 * rewrite every past period. Rebasing instead snapshots what the envelope
 * holds right now and restarts the clock from today, so nothing is invented:
 * raising a daily allowance from 50k to 60k on a 200-day-old envelope would
 * otherwise silently grant Rp 2.000.000 of rollover that never existed.
 */
export function rebase(
  allocation: Allocation,
  allocations: Allocation[],
  transactions: Transaction[],
  todayISO: string
): { openingBalance: number; startDate: string } {
  const owned = resolveClaims(allocations).get(allocation.id) ?? [];
  const summary = summarize(allocation, owned, transactions, todayISO);
  return { openingBalance: summary.available, startDate: todayISO };
}

/**
 * Clears the accumulated carry-over - a surplus on a neglected envelope, or a
 * deficit on an overspent one - without touching the current period's
 * allowance. After a reset one full amount is granted, because a reset that
 * left nothing to spend until tomorrow is not what "start fresh" means.
 */
export function resetRollover(todayISO: string): { openingBalance: number; startDate: string } {
  return { openingBalance: 0, startDate: todayISO };
}

/** Whether an edit invalidates the accumulated history and must rebase. */
export function needsRebase(before: Allocation, after: AllocationFormShape): boolean {
  if (before.amount !== after.amount) return true;
  if (before.cadence !== after.cadence) return true;
  if ((before.intervalDays ?? 1) !== (after.intervalDays ?? 1)) return true;

  const sortedBefore = [...before.categories].sort().join(' ');
  const sortedAfter = [...after.categories].sort().join(' ');
  return sortedBefore !== sortedAfter;
}
