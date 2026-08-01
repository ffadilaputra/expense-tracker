import { describe, it, expect } from 'vitest';
import { computeSpendingTrend } from './spendingTrend';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z', ...partial
  };
}

const TODAY = '2026-08-15';

describe('computeSpendingTrend', () => {
  it('reports spending down with the difference and percentage', () => {
    const txns = [
      tx({ amount: 2600000, date: '2026-07-10' }),
      tx({ amount: 2260000, date: '2026-08-05' })
    ];
    expect(computeSpendingTrend(txns, TODAY)).toEqual({
      direction: 'down',
      difference: 340000,
      percent: 13
    });
  });

  it('reports spending up with the difference and percentage', () => {
    const txns = [
      tx({ amount: 2000000, date: '2026-07-10' }),
      tx({ amount: 2500000, date: '2026-08-05' })
    ];
    expect(computeSpendingTrend(txns, TODAY)).toEqual({
      direction: 'up',
      difference: 500000,
      percent: 25
    });
  });

  it('reports no change when the two months match exactly', () => {
    const txns = [
      tx({ amount: 100000, date: '2026-07-10' }),
      tx({ amount: 100000, date: '2026-08-05' })
    ];
    expect(computeSpendingTrend(txns, TODAY)).toEqual({
      direction: 'same',
      difference: 0,
      percent: 0
    });
  });

  it('ignores income on both sides', () => {
    const txns = [
      tx({ amount: 100000, date: '2026-07-10' }),
      tx({ amount: 9999999, date: '2026-07-11', type: 'income' }),
      tx({ amount: 50000, date: '2026-08-05' }),
      tx({ amount: 9999999, date: '2026-08-06', type: 'income' })
    ];
    expect(computeSpendingTrend(txns, TODAY)).toMatchObject({ direction: 'down', difference: 50000 });
  });

  it('ignores months either side of the two being compared', () => {
    const txns = [
      tx({ amount: 5000000, date: '2026-06-30' }),
      tx({ amount: 200000, date: '2026-07-10' }),
      tx({ amount: 100000, date: '2026-08-05' }),
      tx({ amount: 5000000, date: '2026-09-01' })
    ];
    expect(computeSpendingTrend(txns, TODAY)).toMatchObject({ difference: 100000, percent: 50 });
  });

  it('has nothing to say when last month had no spending', () => {
    // A percentage against zero is meaningless, so there is no message rather
    // than a misleading one.
    expect(computeSpendingTrend([tx({ amount: 100000, date: '2026-08-05' })], TODAY)).toBeNull();
  });

  it('has nothing to say with no transactions at all', () => {
    expect(computeSpendingTrend([], TODAY)).toBeNull();
  });

  it('reports a full drop when this month has no spending yet', () => {
    expect(computeSpendingTrend([tx({ amount: 400000, date: '2026-07-10' })], TODAY)).toEqual({
      direction: 'down',
      difference: 400000,
      percent: 100
    });
  });

  it('compares across the year boundary in January', () => {
    const txns = [
      tx({ amount: 300000, date: '2025-12-20' }),
      tx({ amount: 150000, date: '2026-01-05' })
    ];
    expect(computeSpendingTrend(txns, '2026-01-15')).toEqual({
      direction: 'down',
      difference: 150000,
      percent: 50
    });
  });
});
