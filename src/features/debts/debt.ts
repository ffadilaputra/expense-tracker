import type { Debt, DebtInstalment } from '../../types';

export type InstalmentStatus = 'paid' | 'due' | 'overdue';

export interface ScheduleRow {
  number: number;
  dueDate: string;
  amount: number;
  status: InstalmentStatus;
  paidDate?: string;
  transactionId?: string;
  /** The stored row backing this instalment, when one exists. */
  overrideId?: string;
}

export interface DebtSummary {
  count: number;
  paidCount: number;
  paidAmount: number;
  remainingAmount: number;
  nextDue: ScheduleRow | null;
  hasOverdue: boolean;
  isSettled: boolean;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Adds whole months to an ISO date, clamping to the end of a short month.
 *
 * Measured from the original date every time rather than stepping month by
 * month: 31 Jan + 1 gives 28 Feb, but 31 Jan + 2 must give 31 Mar. Deriving
 * each date from the previous one would leave every later month stuck on the
 * 28th after February had clamped it once.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonth + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0')
  ].join('-');
}

/**
 * The full schedule for a debt: every instalment, computed, with any stored
 * override or payment folded in.
 *
 * The base instalment is the floor of the division and the last one absorbs
 * the remainder, so the rows always sum to exactly `totalAmount`. Spreading
 * the remainder earlier would also add up, but it makes every figure look
 * arbitrary; instalment plans are normally written with the odd amount last.
 */
export function buildSchedule(
  debt: Debt,
  overrides: DebtInstalment[],
  todayISO: string
): ScheduleRow[] {
  const count = Math.max(1, Math.floor(debt.instalmentCount));
  const base = Math.floor(debt.totalAmount / count);
  const remainder = debt.totalAmount - base * count;

  const byNumber = new Map<number, DebtInstalment>();
  for (const o of overrides) {
    if (o.debtId === debt.id && o.number >= 1 && o.number <= count) byNumber.set(o.number, o);
  }

  const rows: ScheduleRow[] = [];
  for (let number = 1; number <= count; number++) {
    const stored = byNumber.get(number);
    const amount =
      stored?.amount != null ? stored.amount : number === count ? base + remainder : base;
    const dueDate = stored?.dueDate || addMonthsClamped(debt.firstDueDate, number - 1);
    const paidDate = stored?.paidDate || undefined;

    rows.push({
      number,
      dueDate,
      amount,
      // A paid instalment is never overdue, however late the payment was.
      status: paidDate ? 'paid' : dueDate < todayISO ? 'overdue' : 'due',
      paidDate,
      transactionId: stored?.transactionId || undefined,
      overrideId: stored?.id
    });
  }

  return rows;
}

export function summarizeDebt(rows: ScheduleRow[]): DebtSummary {
  let paidCount = 0;
  let paidAmount = 0;
  let remainingAmount = 0;
  let hasOverdue = false;
  let nextDue: ScheduleRow | null = null;

  for (const row of rows) {
    if (row.status === 'paid') {
      paidCount++;
      paidAmount += row.amount;
      continue;
    }
    remainingAmount += row.amount;
    if (row.status === 'overdue') hasOverdue = true;
    // Rows are already in schedule order, so the first unpaid one is next.
    if (!nextDue) nextDue = row;
  }

  return {
    count: rows.length,
    paidCount,
    paidAmount,
    remainingAmount,
    nextDue,
    hasOverdue,
    isSettled: rows.length > 0 && paidCount === rows.length
  };
}

export interface DebtWithSummary {
  debt: Debt;
  summary: DebtSummary;
}

export interface AllDebtsSummary {
  /** Everything ever borrowed, across every debt. */
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  /** 0..1 of the total repaid. Zero when there is nothing owed at all. */
  paidFraction: number;
  overdueCount: number;
  /** Unsettled first, overdue ahead of the rest, then by next due date. */
  rows: DebtWithSummary[];
}

/**
 * One pass over every debt, so the card on the transactions screen and the
 * chart on the debts screen are always reading the same numbers.
 */
export function summarizeAllDebts(
  debts: Debt[],
  instalments: DebtInstalment[],
  todayISO: string
): AllDebtsSummary {
  const rows = debts.map((debt) => ({
    debt,
    summary: summarizeDebt(buildSchedule(debt, instalments, todayISO))
  }));

  let totalAmount = 0;
  let paidAmount = 0;
  let remainingAmount = 0;
  let overdueCount = 0;

  for (const { summary } of rows) {
    totalAmount += summary.paidAmount + summary.remainingAmount;
    paidAmount += summary.paidAmount;
    remainingAmount += summary.remainingAmount;
    if (summary.hasOverdue) overdueCount++;
  }

  rows.sort((a, b) => {
    // A settled debt is history; what is still owed is the point of the screen.
    if (a.summary.isSettled !== b.summary.isSettled) return a.summary.isSettled ? 1 : -1;
    if (a.summary.hasOverdue !== b.summary.hasOverdue) return a.summary.hasOverdue ? -1 : 1;
    return (a.summary.nextDue?.dueDate ?? '').localeCompare(b.summary.nextDue?.dueDate ?? '');
  });

  return {
    totalAmount,
    paidAmount,
    remainingAmount,
    paidFraction: totalAmount > 0 ? paidAmount / totalAmount : 0,
    overdueCount,
    rows
  };
}
