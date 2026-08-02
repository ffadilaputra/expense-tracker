import { describe, it, expect } from 'vitest';
import {
  computeDailyExpenseTotals,
  computeThresholds,
  levelFor,
  buildHeatmap
} from './heatmap';
import type { Transaction } from '../../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('computeDailyExpenseTotals', () => {
  it('sums expenses per date and ignores income', () => {
    const totals = computeDailyExpenseTotals([
      tx({ date: '2026-07-01', amount: 10000 }),
      tx({ date: '2026-07-01', amount: 5000 }),
      tx({ date: '2026-07-02', type: 'income', amount: 999999 })
    ]);
    expect(totals.get('2026-07-01')).toBe(15000);
    expect(totals.has('2026-07-02')).toBe(false);
  });
});

describe('computeThresholds', () => {
  it('returns ascending cut points', () => {
    const t = computeThresholds([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(t[0]).toBeLessThanOrEqual(t[1]);
    expect(t[1]).toBeLessThanOrEqual(t[2]);
    expect(t[2]).toBeLessThanOrEqual(t[3]);
  });
  it('is all zeros when empty', () => {
    expect(computeThresholds([])).toEqual([0, 0, 0, 0]);
  });
});

describe('levelFor', () => {
  const thresholds: [number, number, number, number] = [10, 20, 30, 40];
  it('is 0 for no spend', () => {
    expect(levelFor(0, thresholds)).toBe(0);
  });
  it('is 1 at or below the first threshold', () => {
    expect(levelFor(10, thresholds)).toBe(1);
  });
  it('is 4 above the top threshold', () => {
    expect(levelFor(999, thresholds)).toBe(4);
  });
});

describe('buildHeatmap', () => {
  it('produces `weeks` columns of 7 days each ending at today', () => {
    const grid = buildHeatmap([tx({ date: '2026-07-25', amount: 50000 })], 4, '2026-07-25');
    expect(grid.length).toBe(4);
    expect(grid.every((col) => col.length === 7)).toBe(true);
    // today (2026-07-25 is a Saturday) is the last cell of the last column
    const last = grid[grid.length - 1][6];
    expect(last.date).toBe('2026-07-25');
    expect(last.level).toBeGreaterThan(0);
  });
});
