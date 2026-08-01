import type { Transaction } from '../types';

/** All-time balance: everything earned minus everything spent. */
export function computeBalance(txns: Transaction[]): number {
  return txns.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
}

/**
 * Income and expense totals for whatever `txns` contains. Scoping to a period
 * happens upstream via filterByPeriod (see utils/period.ts) so there is one
 * place that decides which transactions are in view.
 */
export function computeTotals(txns: Transaction[]): { income: number; expense: number } {
  return txns.reduce(
    (acc, t) => {
      if (t.type === 'income') acc.income += t.amount;
      else acc.expense += t.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );
}
