import type { Transaction } from '../types';

export interface HeatCell {
  /** null for padding cells before the start of the range. */
  date: string | null;
  total: number;
  level: number;
}

/** Sum expense amounts by calendar date; income does not shade the grid. */
export function computeDailyExpenseTotals(txns: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== 'expense') continue;
    totals.set(t.date, (totals.get(t.date) ?? 0) + t.amount);
  }
  return totals;
}

/**
 * Four ascending cut points at the 20/40/60/80 percentiles of the nonzero
 * daily spend, so shading adapts to the user's own spending scale rather than
 * a fixed rupiah amount. Empty input yields all zeros (every day renders as
 * level 0 or, if it has any spend, level 4 — see levelFor).
 */
export function computeThresholds(nonzeroTotals: number[]): [number, number, number, number] {
  if (nonzeroTotals.length === 0) return [0, 0, 0, 0];
  const sorted = nonzeroTotals.slice().sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return [at(0.2), at(0.4), at(0.6), at(0.8)];
}

/** Bucket a daily total into 0 (none) or 1..4 by the given thresholds. */
export function levelFor(
  total: number,
  thresholds: [number, number, number, number]
): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0) return 0;
  if (total <= thresholds[0]) return 1;
  if (total <= thresholds[1]) return 2;
  if (total <= thresholds[2]) return 3;
  return 4;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a GitHub-style grid: `weeks` columns, each a Sun..Sat run of 7 days,
 * with the column containing `todayISO` last. Days before the range start are
 * padding cells (date: null). Shading levels are computed from the whole
 * range's nonzero daily spend so the scale is stable across the grid.
 */
export function buildHeatmap(
  txns: Transaction[],
  weeks: number,
  todayISO: string
): HeatCell[][] {
  const totals = computeDailyExpenseTotals(txns);

  // Last column ends on the Saturday of today's week.
  const todayDow = new Date(`${todayISO}T00:00:00Z`).getUTCDay(); // 0=Sun
  const lastCellISO = addDays(todayISO, 6 - todayDow);
  const firstCellISO = addDays(lastCellISO, -(weeks * 7 - 1));

  const rangeTotals: number[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const iso = addDays(firstCellISO, i);
    const total = totals.get(iso) ?? 0;
    if (total > 0) rangeTotals.push(total);
  }
  const thresholds = computeThresholds(rangeTotals);

  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(firstCellISO, w * 7 + d);
      if (iso > todayISO) {
        col.push({ date: null, total: 0, level: 0 });
        continue;
      }
      const total = totals.get(iso) ?? 0;
      col.push({ date: iso, total, level: levelFor(total, thresholds) });
    }
    grid.push(col);
  }
  return grid;
}
