import { describe, it, expect } from 'vitest';
import { availableMonths, currentMonth, monthName, previousMonth, filterByPeriod } from './period';
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

describe('monthName', () => {
  it('renders a month key for people', () => {
    expect(monthName('2026-03', 'en')).toBe('March 2026');
    expect(monthName('2026-12', 'en')).toBe('December 2026');
  });

  it('follows the locale', () => {
    expect(monthName('2026-03', 'id')).toBe('Maret 2026');
  });

  it('reads the key in UTC so January cannot slip to the previous year', () => {
    expect(monthName('2026-01', 'en')).toBe('January 2026');
  });
});

describe('availableMonths', () => {
  it('lists every month holding a transaction, newest first', () => {
    const txns = [
      tx({ date: '2026-06-15' }),
      tx({ date: '2026-04-02' }),
      tx({ date: '2026-06-28' })
    ];
    expect(availableMonths(txns, '2026-08-01')).toEqual(['2026-08', '2026-06', '2026-04']);
  });

  it('always includes the current month so a new sheet is not empty', () => {
    expect(availableMonths([], '2026-08-01')).toEqual(['2026-08']);
  });

  it('does not repeat the current month when it also holds transactions', () => {
    expect(availableMonths([tx({ date: '2026-08-05' })], '2026-08-01')).toEqual(['2026-08']);
  });

  it('leaves out months in the future', () => {
    const txns = [tx({ date: '2026-09-01' }), tx({ date: '2026-07-01' })];
    expect(availableMonths(txns, '2026-08-01')).toEqual(['2026-08', '2026-07']);
  });

  it('spans a year boundary in order', () => {
    const txns = [tx({ date: '2025-12-20' }), tx({ date: '2026-01-05' })];
    expect(availableMonths(txns, '2026-01-15')).toEqual(['2026-01', '2025-12']);
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
