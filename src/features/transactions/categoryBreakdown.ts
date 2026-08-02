import { UNCATEGORIZED } from './categoryChips';
import type { Transaction } from '../../types';

/**
 * Six validated hues are available, so six segments can be drawn outright.
 * Past that the tail folds into a single remainder - a doughnut stops being
 * readable well before the colours run out.
 */
export const MAX_SLOTS = 6;

/** Remainder segment. Leading space cannot collide with a real category. */
export const OTHER = ' other';

export interface BreakdownSegment {
  /** A real category name, UNCATEGORIZED, or OTHER. */
  category: string;
  amount: number;
  /** Share of the total, 0..1. */
  fraction: number;
  /** Palette slot 0..5; -1 for the remainder, which renders grey. */
  slot: number;
}

export interface Breakdown {
  segments: BreakdownSegment[];
  total: number;
}

function normalize(category: string): string {
  const trimmed = category.trim();
  return trimmed === '' ? UNCATEGORIZED : trimmed;
}

/**
 * Expense by category for whatever transactions are handed in, largest first.
 *
 * Income is excluded: mixing what came in with what went out in one ring would
 * make the total meaningless. Ties break on name so the order - and therefore
 * the colours - never depend on input ordering.
 *
 * Colours follow rank, not identity: the largest slice always takes the first
 * palette slot. That keeps ring neighbours adjacent in the palette, which is
 * the arrangement the colour separation was validated for; assigning by
 * identity would put arbitrary pairs side by side, which the same check fails.
 * The cost is that a category can change colour when the period changes, so
 * the legend always carries the name and the figure.
 */
export function buildBreakdown(txns: Transaction[]): Breakdown {
  const byCategory = new Map<string, number>();
  let total = 0;

  for (const t of txns) {
    if (t.type !== 'expense') continue;
    const key = normalize(t.category);
    byCategory.set(key, (byCategory.get(key) ?? 0) + t.amount);
    total += t.amount;
  }

  if (total <= 0) return { segments: [], total: 0 };

  const ranked = [...byCategory.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])));

  const named = ranked.length > MAX_SLOTS ? ranked.slice(0, MAX_SLOTS - 1) : ranked;
  const segments: BreakdownSegment[] = named.map(([category, amount], i) => ({
    category,
    amount,
    fraction: amount / total,
    slot: i
  }));

  const remainder = total - named.reduce((sum, [, amount]) => sum + amount, 0);
  if (remainder > 0) {
    segments.push({ category: OTHER, amount: remainder, fraction: remainder / total, slot: -1 });
  }

  return { segments, total };
}
