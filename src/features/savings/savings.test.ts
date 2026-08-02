import { describe, it, expect } from 'vitest';
import { summarizeAllSavings, summarizeSaving } from './savings';
import type { Saving, SavingContribution } from '../../types';

function saving(partial: Partial<Saving> = {}): Saving {
  return {
    id: 's1', name: 'Umrah', targetAmount: 20000000,
    createdAt: '2026-08-01T00:00:00.000Z', ...partial
  };
}

function give(partial: Partial<SavingContribution> = {}): SavingContribution {
  return {
    id: Math.random().toString(36), savingId: 's1', amount: 0,
    date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', ...partial
  };
}

describe('summarizeSaving', () => {
  it('adds up contributions and reports what is left', () => {
    const s = summarizeSaving(saving(), [give({ amount: 1500000 }), give({ amount: 1000000 })]);
    expect(s).toMatchObject({
      savedAmount: 2500000,
      remainingAmount: 17500000,
      contributionCount: 2,
      isComplete: false
    });
    expect(s.fraction).toBeCloseTo(0.125, 6);
  });

  it('ignores contributions belonging to another goal', () => {
    const s = summarizeSaving(saving(), [give({ amount: 500 }), give({ savingId: 'other', amount: 9999 })]);
    expect(s.savedAmount).toBe(500);
    expect(s.contributionCount).toBe(1);
  });

  it('is empty for a goal with no contributions', () => {
    expect(summarizeSaving(saving(), [])).toMatchObject({
      savedAmount: 0, remainingAmount: 20000000, fraction: 0, isComplete: false
    });
  });

  it('completes exactly on target', () => {
    const s = summarizeSaving(saving({ targetAmount: 1000 }), [give({ amount: 1000 })]);
    expect(s).toMatchObject({ remainingAmount: 0, fraction: 1, isComplete: true });
  });

  it('reports the true amount when overfunded but clamps the fraction', () => {
    // The bar must not draw past its own track, and the figure must not lie.
    const s = summarizeSaving(saving({ targetAmount: 1000 }), [give({ amount: 1500 })]);
    expect(s).toMatchObject({ savedAmount: 1500, remainingAmount: 0, fraction: 1, isComplete: true });
  });

  it('never divides by a target of zero or less', () => {
    expect(summarizeSaving(saving({ targetAmount: 0 }), [give({ amount: 500 })]).fraction).toBe(0);
    expect(summarizeSaving(saving({ targetAmount: -5 }), [give({ amount: 500 })]).fraction).toBe(0);
  });
});

describe('summarizeAllSavings', () => {
  const savings = [
    saving({ id: 's1', name: 'Umrah', targetAmount: 1000 }),
    saving({ id: 's2', name: 'Laptop', targetAmount: 500 })
  ];

  it('totals saved and target across every goal', () => {
    const all = summarizeAllSavings(savings, [
      give({ savingId: 's1', amount: 250 }),
      give({ savingId: 's2', amount: 500 })
    ]);
    expect(all).toMatchObject({
      savedAmount: 750, targetAmount: 1500, completeCount: 1
    });
    expect(all.fraction).toBeCloseTo(0.5, 6);
  });

  it('sorts completed goals last', () => {
    const all = summarizeAllSavings(savings, [give({ savingId: 's2', amount: 500 })]);
    expect(all.rows.map((r) => r.saving.id)).toEqual(['s1', 's2']);
  });

  it('counts overfunded goals as complete once each', () => {
    const all = summarizeAllSavings(savings, [
      give({ savingId: 's1', amount: 9999 }),
      give({ savingId: 's2', amount: 9999 })
    ]);
    expect(all.completeCount).toBe(2);
  });

  it('is all zeroes with no goals and does not divide by zero', () => {
    expect(summarizeAllSavings([], [])).toMatchObject({
      savedAmount: 0, targetAmount: 0, fraction: 0, completeCount: 0, rows: []
    });
  });
});
