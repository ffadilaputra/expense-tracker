import { describe, it, expect } from 'vitest';
import { computeBalance, computeMonthTotals } from './summary';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('computeBalance', () => {
  it('is income minus expense', () => {
    const txns = [
      tx({ type: 'income', amount: 5000000 }),
      tx({ type: 'expense', amount: 2000000 }),
      tx({ type: 'expense', amount: 500000 })
    ];
    expect(computeBalance(txns)).toBe(2500000);
  });
  it('is zero for no transactions', () => {
    expect(computeBalance([])).toBe(0);
  });
});

describe('computeMonthTotals', () => {
  it('sums only transactions in the reference month', () => {
    const txns = [
      tx({ type: 'income', amount: 5000000, date: '2026-07-25' }),
      tx({ type: 'expense', amount: 2000000, date: '2026-07-10' }),
      tx({ type: 'expense', amount: 999, date: '2026-06-30' }),
      tx({ type: 'income', amount: 111, date: '2026-08-01' })
    ];
    expect(computeMonthTotals(txns, '2026-07-25')).toEqual({ income: 5000000, expense: 2000000 });
  });
});
