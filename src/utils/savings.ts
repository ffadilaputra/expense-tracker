import type { Saving, SavingContribution } from '../types';

export interface SavingSummary {
  savedAmount: number;
  /** Never negative: an overfunded goal has nothing left, not a debt. */
  remainingAmount: number;
  /** 0..1, clamped, so a progress bar cannot draw past its own track. */
  fraction: number;
  isComplete: boolean;
  contributionCount: number;
}

export interface SavingWithSummary {
  saving: Saving;
  summary: SavingSummary;
}

export interface AllSavingsSummary {
  savedAmount: number;
  targetAmount: number;
  fraction: number;
  completeCount: number;
  /** Unfinished goals first; a reached goal is no longer the thing to act on. */
  rows: SavingWithSummary[];
}

export function summarizeSaving(
  saving: Saving,
  contributions: SavingContribution[]
): SavingSummary {
  let savedAmount = 0;
  let contributionCount = 0;

  for (const c of contributions) {
    if (c.savingId !== saving.id) continue;
    savedAmount += c.amount;
    contributionCount++;
  }

  // A target of zero or less would make the fraction Infinity or NaN, which
  // ends up in a width style and breaks the bar rather than showing anything.
  const target = saving.targetAmount > 0 ? saving.targetAmount : 0;

  return {
    savedAmount,
    remainingAmount: Math.max(0, target - savedAmount),
    fraction: target > 0 ? Math.min(1, savedAmount / target) : 0,
    isComplete: target > 0 && savedAmount >= target,
    contributionCount
  };
}

/**
 * One pass over every goal, so the grid and the summary card are always
 * reading the same numbers.
 */
export function summarizeAllSavings(
  savings: Saving[],
  contributions: SavingContribution[]
): AllSavingsSummary {
  const rows = savings.map((saving) => ({
    saving,
    summary: summarizeSaving(saving, contributions)
  }));

  let savedAmount = 0;
  let targetAmount = 0;
  let completeCount = 0;

  for (const { saving, summary } of rows) {
    savedAmount += summary.savedAmount;
    targetAmount += Math.max(0, saving.targetAmount);
    if (summary.isComplete) completeCount++;
  }

  rows.sort((a, b) => {
    if (a.summary.isComplete !== b.summary.isComplete) return a.summary.isComplete ? 1 : -1;
    return a.saving.name.localeCompare(b.saving.name);
  });

  return {
    savedAmount,
    targetAmount,
    fraction: targetAmount > 0 ? Math.min(1, savedAmount / targetAmount) : 0,
    completeCount,
    rows
  };
}
