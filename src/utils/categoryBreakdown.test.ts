import { describe, it, expect } from 'vitest';
import { MAX_SLOTS, OTHER, buildBreakdown } from './categoryBreakdown';
import { UNCATEGORIZED } from './categoryFilter';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36), type: 'expense', amount: 0, category: '',
    date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', ...partial
  };
}

describe('buildBreakdown', () => {
  it('totals expense by category, largest first', () => {
    const { segments, total } = buildBreakdown([
      tx({ category: 'Food', amount: 300 }),
      tx({ category: 'Transport', amount: 500 }),
      tx({ category: 'Food', amount: 400 })
    ]);
    expect(total).toBe(1200);
    expect(segments.map((s) => [s.category, s.amount])).toEqual([
      ['Food', 700],
      ['Transport', 500]
    ]);
  });

  it('assigns palette slots in rank order', () => {
    const { segments } = buildBreakdown([
      tx({ category: 'B', amount: 10 }),
      tx({ category: 'A', amount: 90 })
    ]);
    expect(segments.map((s) => [s.category, s.slot])).toEqual([
      ['A', 0],
      ['B', 1]
    ]);
  });

  it('gives fractions that sum to one', () => {
    const { segments } = buildBreakdown([
      tx({ category: 'A', amount: 750 }),
      tx({ category: 'B', amount: 250 })
    ]);
    expect(segments.map((s) => s.fraction)).toEqual([0.75, 0.25]);
    expect(segments.reduce((sum, s) => sum + s.fraction, 0)).toBeCloseTo(1, 10);
  });

  it('excludes income so the total is money actually spent', () => {
    const { segments, total } = buildBreakdown([
      tx({ category: 'Food', amount: 100 }),
      tx({ category: 'Salary', amount: 9999, type: 'income' })
    ]);
    expect(total).toBe(100);
    expect(segments).toHaveLength(1);
  });

  it('groups blank categories under the uncategorized key', () => {
    const { segments } = buildBreakdown([
      tx({ category: '', amount: 50 }),
      tx({ category: '   ', amount: 70 })
    ]);
    expect(segments).toEqual([
      { category: UNCATEGORIZED, amount: 120, fraction: 1, slot: -1 + 1 }
    ]);
  });

  it('shows every category outright when they fit the palette', () => {
    const txns = Array.from({ length: MAX_SLOTS }, (_, i) =>
      tx({ category: `C${i}`, amount: 100 - i })
    );
    const { segments } = buildBreakdown(txns);
    expect(segments).toHaveLength(MAX_SLOTS);
    expect(segments.some((s) => s.category === OTHER)).toBe(false);
  });

  it('folds the tail into one remainder once they do not', () => {
    const txns = Array.from({ length: MAX_SLOTS + 3 }, (_, i) =>
      tx({ category: `C${i}`, amount: 100 - i })
    );
    const { segments } = buildBreakdown(txns);

    expect(segments).toHaveLength(MAX_SLOTS);
    const last = segments[segments.length - 1];
    expect(last.category).toBe(OTHER);
    expect(last.slot).toBe(-1);
  });

  it('puts every unshown category into the remainder, losing nothing', () => {
    const txns = Array.from({ length: 10 }, (_, i) => tx({ category: `C${i}`, amount: 10 }));
    const { segments, total } = buildBreakdown(txns);

    expect(total).toBe(100);
    expect(segments.reduce((sum, s) => sum + s.amount, 0)).toBe(100);
    expect(segments.reduce((sum, s) => sum + s.fraction, 0)).toBeCloseTo(1, 10);
  });

  it('breaks ties on name so colours never depend on input order', () => {
    const forward = buildBreakdown([
      tx({ category: 'Beta', amount: 100 }),
      tx({ category: 'Alpha', amount: 100 })
    ]);
    const reversed = buildBreakdown([
      tx({ category: 'Alpha', amount: 100 }),
      tx({ category: 'Beta', amount: 100 })
    ]);
    expect(forward.segments.map((s) => s.category)).toEqual(['Alpha', 'Beta']);
    expect(reversed.segments).toEqual(forward.segments);
  });

  it('has nothing to show when there is no spending', () => {
    expect(buildBreakdown([])).toEqual({ segments: [], total: 0 });
    expect(buildBreakdown([tx({ type: 'income', amount: 500 })])).toEqual({ segments: [], total: 0 });
  });
});
