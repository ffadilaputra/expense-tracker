import { computeTotals } from './summary';
import { currentMonth, filterByPeriod, previousMonth } from './period';
import type { Transaction } from '../types';

export interface SpendingTrend {
  direction: 'up' | 'down' | 'same';
  /** Absolute rupiah difference; the sign lives in `direction`. */
  difference: number;
  /** Absolute percentage change against last month, rounded. */
  percent: number;
}

/**
 * Compares this calendar month's spending against last month's, independently
 * of whichever period the screen is showing — so the message means the same
 * thing wherever the user has navigated to. The wording names both months
 * explicitly for that reason.
 *
 * Returns null when there is nothing honest to say: with no spending at all
 * last month there is no baseline, and a percentage against zero would be
 * meaningless.
 */
export function computeSpendingTrend(txns: Transaction[], todayISO: string): SpendingTrend | null {
  const thisMonth = computeTotals(filterByPeriod(txns, currentMonth(todayISO))).expense;
  const lastMonth = computeTotals(filterByPeriod(txns, previousMonth(todayISO))).expense;

  if (lastMonth === 0) return null;

  const change = thisMonth - lastMonth;
  if (change === 0) return { direction: 'same', difference: 0, percent: 0 };

  return {
    direction: change > 0 ? 'up' : 'down',
    difference: Math.abs(change),
    percent: Math.round((Math.abs(change) / lastMonth) * 100)
  };
}
