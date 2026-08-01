import { describe, it, expect } from 'vitest';
import { computeBalance, computeTotals } from './summary';
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

describe('computeTotals', () => {
  it('sums income and expense separately', () => {
    const txns = [
      tx({ type: 'income', amount: 5000000 }),
      tx({ type: 'income', amount: 250000 }),
      tx({ type: 'expense', amount: 2000000 })
    ];
    expect(computeTotals(txns)).toEqual({ income: 5250000, expense: 2000000 });
  });

  it('is zero for no transactions', () => {
    expect(computeTotals([])).toEqual({ income: 0, expense: 0 });
  });
});
