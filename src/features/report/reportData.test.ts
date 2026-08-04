import { describe, it, expect } from 'vitest';
import { buildReport, daysInMonth } from './reportData';
import type { Transaction } from '../../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: 'Food', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('daysInMonth', () => {
  it('counts a 31-day month', () => expect(daysInMonth('2026-01')).toBe(31));
  it('counts a 30-day month', () => expect(daysInMonth('2026-04')).toBe(30));
  it('counts a common February', () => expect(daysInMonth('2026-02')).toBe(28));
  it('counts a leap February', () => expect(daysInMonth('2024-02')).toBe(29));
  it('counts December, where the month index rolls the year', () => {
    expect(daysInMonth('2026-12')).toBe(31);
  });
});

describe('buildReport totals', () => {
  it('sums income and expense in the period and nets them', () => {
    const txns = [
      tx({ type: 'income', amount: 1000, date: '2026-07-05' }),
      tx({ type: 'expense', amount: 400, date: '2026-07-06' }),
      tx({ type: 'expense', amount: 999, date: '2026-08-01' })
    ];
    const report = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(report.totals).toEqual({ income: 1000, expense: 400, net: 600 });
  });

  it('nets negative when the period spent more than it earned', () => {
    const txns = [tx({ type: 'expense', amount: 500, date: '2026-07-05' })];
    const report = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(report.totals).toEqual({ income: 0, expense: 500, net: -500 });
  });
});

describe('buildReport year buckets', () => {
  it('always returns twelve months in order, including empty ones', () => {
    const txns = [
      tx({ type: 'income', amount: 300, date: '2026-01-15' }),
      tx({ type: 'expense', amount: 120, date: '2026-01-20' }),
      tx({ type: 'expense', amount: 50, date: '2026-12-31' })
    ];
    const { buckets } = buildReport(txns, { kind: 'year', year: '2026' }, 'en');

    expect(buckets).toHaveLength(12);
    expect(buckets.map((b) => b.label)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ]);
    expect(buckets[0]).toEqual({ label: 'Jan', income: 300, expense: 120 });
    expect(buckets[5]).toEqual({ label: 'Jun', income: 0, expense: 0 });
    expect(buckets[11]).toEqual({ label: 'Dec', income: 0, expense: 50 });
  });

  it('names the months in the active locale', () => {
    const { buckets } = buildReport([], { kind: 'year', year: '2026' }, 'id');
    expect(buckets[0].label).toBe('Jan');
    expect(buckets[7].label).toBe('Agu');
  });
});

describe('buildReport month buckets', () => {
  it('returns one bucket per day of a 31-day month', () => {
    const { buckets } = buildReport([], { kind: 'month', key: '2026-07' }, 'en');
    expect(buckets).toHaveLength(31);
    expect(buckets[0].label).toBe('1');
    expect(buckets[30].label).toBe('31');
  });

  it('returns 28 buckets for a common February and 29 for a leap one', () => {
    expect(buildReport([], { kind: 'month', key: '2026-02' }, 'en').buckets).toHaveLength(28);
    expect(buildReport([], { kind: 'month', key: '2024-02' }, 'en').buckets).toHaveLength(29);
  });

  it('lands each transaction on its own day', () => {
    const txns = [
      tx({ type: 'expense', amount: 70, date: '2026-07-01' }),
      tx({ type: 'income', amount: 900, date: '2026-07-25' })
    ];
    const { buckets } = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(buckets[0]).toEqual({ label: '1', income: 0, expense: 70 });
    expect(buckets[24]).toEqual({ label: '25', income: 900, expense: 0 });
  });
});

describe('buildReport day period', () => {
  it('produces no buckets, because a single bar is not a chart', () => {
    const txns = [tx({ type: 'expense', amount: 70, date: '2026-07-01' })];
    const report = buildReport(txns, { kind: 'date', date: '2026-07-01' }, 'en');
    expect(report.buckets).toEqual([]);
    expect(report.totals.expense).toBe(70);
    expect(report.breakdown.total).toBe(70);
  });
});

describe('buildReport rows', () => {
  it('returns the in-period transactions newest first', () => {
    const txns = [
      tx({ id: 'old', date: '2026-07-01' }),
      tx({ id: 'new', date: '2026-07-28' }),
      tx({ id: 'mid', date: '2026-07-14' }),
      tx({ id: 'out', date: '2026-06-30' })
    ];
    const { rows } = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks same-day ties on creation time, newest first', () => {
    const txns = [
      tx({ id: 'first', date: '2026-07-10', createdAt: '2026-07-10T08:00:00.000Z' }),
      tx({ id: 'second', date: '2026-07-10', createdAt: '2026-07-10T19:00:00.000Z' })
    ];
    const { rows } = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(rows.map((r) => r.id)).toEqual(['second', 'first']);
  });

  it('does not mutate the input array', () => {
    const txns = [tx({ id: 'a', date: '2026-07-01' }), tx({ id: 'b', date: '2026-07-28' })];
    buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(txns.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('buildReport on an empty period', () => {
  it('zeroes everything rather than returning nulls', () => {
    const report = buildReport([], { kind: 'month', key: '2026-07' }, 'en');
    expect(report.totals).toEqual({ income: 0, expense: 0, net: 0 });
    expect(report.breakdown).toEqual({ segments: [], total: 0 });
    expect(report.rows).toEqual([]);
    expect(report.buckets).toHaveLength(31);
  });
});
