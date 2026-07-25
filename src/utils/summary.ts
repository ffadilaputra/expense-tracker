import type { Transaction } from '../types';

/** All-time balance: everything earned minus everything spent. */
export function computeBalance(txns: Transaction[]): number {
  return txns.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
}

/** Year+month prefix of an ISO date, e.g. "2026-07-25" -> "2026-07". */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Income and expense totals for the month containing `refISODate`. */
export function computeMonthTotals(
  txns: Transaction[],
  refISODate: string
): { income: number; expense: number } {
  const key = monthKey(refISODate);
  return txns.reduce(
    (acc, t) => {
      if (monthKey(t.date) !== key) return acc;
      if (t.type === 'income') acc.income += t.amount;
      else acc.expense += t.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );
}
