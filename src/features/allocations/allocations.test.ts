import { describe, it, expect } from 'vitest';
import {
  currentPeriod,
  needsRebase,
  periodsElapsed,
  rebase,
  resetRollover,
  summarizeAllocations,
  totalAllocated,
  unallocated
} from './allocations';
import type { Allocation, Transaction } from '../../types';

function make(over: Partial<Allocation> = {}): Allocation {
  return {
    id: 'a1',
    name: 'Food',
    icon: '',
    amount: 50000,
    cadence: 'daily',
    intervalDays: 1,
    categories: ['Food'],
    startDate: '2026-08-01',
    openingBalance: 0,
    note: '',
    createdAt: 'ts',
    ...over
  };
}

describe('periodsElapsed', () => {
  it('counts the start date itself as period one', () => {
    expect(periodsElapsed(make(), '2026-08-01')).toBe(1);
  });

  it('counts a day per period when daily', () => {
    expect(periodsElapsed(make(), '2026-08-10')).toBe(10);
  });

  it('counts a week per period when weekly', () => {
    const a = make({ cadence: 'weekly' });
    expect(periodsElapsed(a, '2026-08-07')).toBe(1);
    expect(periodsElapsed(a, '2026-08-08')).toBe(2);
  });

  it('uses intervalDays when the cadence is days', () => {
    const a = make({ cadence: 'days', intervalDays: 10 });
    expect(periodsElapsed(a, '2026-08-10')).toBe(1);
    expect(periodsElapsed(a, '2026-08-11')).toBe(2);
  });

  it('counts calendar months when monthly', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-15' });
    expect(periodsElapsed(a, '2026-01-14')).toBe(0);
    expect(periodsElapsed(a, '2026-01-15')).toBe(1);
    expect(periodsElapsed(a, '2026-02-14')).toBe(1);
    expect(periodsElapsed(a, '2026-02-15')).toBe(2);
    expect(periodsElapsed(a, '2026-04-20')).toBe(4);
  });

  // A monthly envelope anchored past the end of a short month must not skip it.
  it('clamps a month anchor of 31 into February', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-31' });
    expect(periodsElapsed(a, '2026-02-27')).toBe(1);
    expect(periodsElapsed(a, '2026-02-28')).toBe(2);
    expect(periodsElapsed(a, '2026-03-30')).toBe(2);
    expect(periodsElapsed(a, '2026-03-31')).toBe(3);
  });

  it('uses 29 February in a leap year', () => {
    const a = make({ cadence: 'monthly', startDate: '2028-01-31' });
    expect(periodsElapsed(a, '2028-02-28')).toBe(1);
    expect(periodsElapsed(a, '2028-02-29')).toBe(2);
  });

  it('crosses a year boundary', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-11-10' });
    expect(periodsElapsed(a, '2027-01-10')).toBe(3);
  });

  it('reports zero before the envelope starts', () => {
    expect(periodsElapsed(make({ startDate: '2026-09-01' }), '2026-08-15')).toBe(0);
  });
});

describe('currentPeriod', () => {
  it('is the single day when daily', () => {
    expect(currentPeriod(make(), '2026-08-10')).toEqual({
      start: '2026-08-10',
      end: '2026-08-10'
    });
  });

  it('runs from the anchor for a whole week when weekly', () => {
    expect(currentPeriod(make({ cadence: 'weekly' }), '2026-08-09')).toEqual({
      start: '2026-08-08',
      end: '2026-08-14'
    });
  });

  it('runs anchor to the day before the next anchor when monthly', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-15' });
    expect(currentPeriod(a, '2026-03-02')).toEqual({
      start: '2026-02-15',
      end: '2026-03-14'
    });
  });

  it('clamps both ends of a 31st-anchored month', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-31' });
    expect(currentPeriod(a, '2026-02-28')).toEqual({
      start: '2026-02-28',
      end: '2026-03-30'
    });
  });

  it('reports the first period before the envelope starts', () => {
    expect(currentPeriod(make({ startDate: '2026-09-01' }), '2026-08-15')).toEqual({
      start: '2026-09-01',
      end: '2026-09-01'
    });
  });
});

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    type: 'expense',
    amount: 10000,
    category: 'Food',
    date: '2026-08-01',
    note: '',
    createdAt: 'ts',
    accountId: '',
    ...over
  };
}

describe('summarizeAllocations', () => {
  const today = '2026-08-03';

  it('grants one amount per elapsed period', () => {
    const [row] = summarizeAllocations([make()], [], today);
    expect(row.summary.periodsElapsed).toBe(3);
    expect(row.summary.granted).toBe(150000);
    expect(row.summary.available).toBe(150000);
  });

  it('carries an opening balance in', () => {
    const [row] = summarizeAllocations([make({ openingBalance: 20000 })], [], today);
    expect(row.summary.granted).toBe(170000);
  });

  it('draws down on expenses in a claimed category', () => {
    const [row] = summarizeAllocations([make()], [txn({ amount: 30000 })], today);
    expect(row.summary.spent).toBe(30000);
    expect(row.summary.available).toBe(120000);
  });

  it('ignores expenses in categories it does not claim', () => {
    const [row] = summarizeAllocations([make()], [txn({ category: 'Transport' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('matches a category exactly, so Food and food stay distinct', () => {
    const [row] = summarizeAllocations([make()], [txn({ category: 'food' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('ignores income landing in a claimed category', () => {
    const [row] = summarizeAllocations([make()], [txn({ type: 'income', amount: 90000 })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('ignores spending from before the envelope started', () => {
    const [row] = summarizeAllocations([make()], [txn({ date: '2026-07-20' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('ignores future-dated spending until its date arrives', () => {
    const [row] = summarizeAllocations([make()], [txn({ date: '2026-08-20' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('goes negative when overdrawn', () => {
    const [row] = summarizeAllocations([make()], [txn({ amount: 400000 })], today);
    expect(row.summary.available).toBe(-250000);
    expect(row.summary.isOverdrawn).toBe(true);
  });

  it('reports this period separately from the running total', () => {
    const rows = summarizeAllocations(
      [make()],
      [txn({ id: 't1', date: '2026-08-01', amount: 20000 }),
       txn({ id: 't2', date: '2026-08-03', amount: 5000 })],
      today
    );
    expect(rows[0].summary.spent).toBe(25000);
    expect(rows[0].summary.spentThisPeriod).toBe(5000);
    expect(rows[0].summary.periodRemaining).toBe(45000);
  });

  // A hand-edited sheet can put one category in two envelopes. Under-counting
  // is wrong once; double-counting is wrong twice.
  it('gives a contested category to the first claimant only', () => {
    const first = make({ id: 'a1', createdAt: '2026-01-01' });
    const second = make({ id: 'a2', createdAt: '2026-02-01' });
    const rows = summarizeAllocations([second, first], [txn({ amount: 30000 })], today);
    const byId = new Map(rows.map((r) => [r.allocation.id, r.summary]));
    expect(byId.get('a1')!.spent).toBe(30000);
    expect(byId.get('a2')!.spent).toBe(0);
  });
});

describe('unallocated', () => {
  const today = '2026-08-03';

  it('subtracts what the envelopes still hold', () => {
    const rows = summarizeAllocations([make()], [], today);
    expect(totalAllocated(rows)).toBe(150000);
    expect(unallocated(500000, rows)).toBe(350000);
  });

  // An overdrawn envelope holds nothing; that money already left the balance,
  // so counting it as a negative claim would report more free cash than exists.
  it('clamps an overdrawn envelope at zero', () => {
    const rows = summarizeAllocations([make()], [txn({ amount: 400000 })], today);
    expect(totalAllocated(rows)).toBe(0);
    expect(unallocated(500000, rows)).toBe(500000);
  });

  it('goes negative when the envelopes promise more than is held', () => {
    const rows = summarizeAllocations([make({ openingBalance: 900000 })], [], today);
    expect(unallocated(500000, rows)).toBe(-550000);
  });
});

describe('rebase', () => {
  const today = '2026-08-03';

  it('snapshots the current balance and restarts the clock', () => {
    const a = make();
    expect(rebase(a, [a], [txn({ amount: 30000 })], today)).toEqual({
      openingBalance: 120000,
      startDate: today
    });
  });

  it('carries a deficit rather than forgiving it', () => {
    const a = make();
    expect(rebase(a, [a], [txn({ amount: 400000 })], today).openingBalance).toBe(-250000);
  });
});

describe('resetRollover', () => {
  it('drops the carried balance and restarts today', () => {
    expect(resetRollover('2026-08-03')).toEqual({
      openingBalance: 0,
      startDate: '2026-08-03'
    });
  });

  // Reset clears the accumulation, not the current period's allowance: after
  // it, one full amount is granted, so the day is still spendable.
  it('leaves the current period fully granted', () => {
    const reset = resetRollover('2026-08-03');
    const a = make({ ...reset });
    const [row] = summarizeAllocations([a], [], '2026-08-03');
    expect(row.summary.available).toBe(50000);
  });
});

describe('needsRebase', () => {
  it('is true when the amount changes', () => {
    expect(needsRebase(make(), { ...make(), amount: 60000 })).toBe(true);
  });

  it('is true when the cadence changes', () => {
    expect(needsRebase(make(), { ...make(), cadence: 'weekly' })).toBe(true);
  });

  it('is true when the interval changes', () => {
    const before = make({ cadence: 'days', intervalDays: 10 });
    expect(needsRebase(before, { ...before, intervalDays: 14 })).toBe(true);
  });

  // Adding a category would otherwise let months of past spending in it
  // retroactively drain a pot that had been running fine.
  it('is true when the categories change', () => {
    expect(needsRebase(make(), { ...make(), categories: ['Food', 'Groceries'] })).toBe(true);
  });

  it('ignores category order', () => {
    const before = make({ categories: ['Food', 'Groceries'] });
    expect(needsRebase(before, { ...before, categories: ['Groceries', 'Food'] })).toBe(false);
  });

  it('is false when only the name changes', () => {
    expect(needsRebase(make(), { ...make() })).toBe(false);
  });
});
