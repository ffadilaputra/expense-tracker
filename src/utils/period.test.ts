import { describe, it, expect } from 'vitest';
import { currentMonth, previousMonth, filterByPeriod } from './period';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('currentMonth', () => {
  it('takes the year-month of the reference date', () => {
    expect(currentMonth('2026-07-25')).toEqual({ kind: 'month', key: '2026-07' });
  });
});

describe('previousMonth', () => {
  it('steps back one month', () => {
    expect(previousMonth('2026-07-25')).toEqual({ kind: 'month', key: '2026-06' });
  });
  it('rolls back across the year boundary', () => {
    expect(previousMonth('2026-01-15')).toEqual({ kind: 'month', key: '2025-12' });
  });
  it('does not depend on the day of month', () => {
    expect(previousMonth('2026-03-31')).toEqual(previousMonth('2026-03-01'));
  });
});

describe('filterByPeriod', () => {
  const txns = [
    tx({ id: 'a', date: '2026-07-25' }),
    tx({ id: 'b', date: '2026-07-01' }),
    tx({ id: 'c', date: '2026-06-30' }),
    tx({ id: 'd', date: '2026-08-01' })
  ];

  it('keeps only transactions in the month', () => {
    const kept = filterByPeriod(txns, { kind: 'month', key: '2026-07' });
    expect(kept.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('keeps only transactions on the exact date', () => {
    const kept = filterByPeriod(txns, { kind: 'date', date: '2026-07-25' });
    expect(kept.map((t) => t.id)).toEqual(['a']);
  });

  it('returns nothing for a period with no transactions', () => {
    expect(filterByPeriod(txns, { kind: 'month', key: '2020-01' })).toEqual([]);
  });

  it('returns nothing for empty input', () => {
    expect(filterByPeriod([], { kind: 'month', key: '2026-07' })).toEqual([]);
  });
});
