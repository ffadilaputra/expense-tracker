import { describe, it, expect } from 'vitest';
import { addMonthsClamped, buildSchedule, summarizeAllDebts, summarizeDebt } from './debt';
import type { Debt, DebtInstalment } from '../types';

function debt(partial: Partial<Debt> = {}): Debt {
  return {
    id: 'd1',
    name: 'Motorbike loan',
    totalAmount: 12000000,
    instalmentCount: 24,
    firstDueDate: '2026-09-05',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...partial
  };
}

function override(partial: Partial<DebtInstalment> & { number: number }): DebtInstalment {
  return {
    id: `i${partial.number}`,
    debtId: 'd1',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...partial
  };
}

describe('addMonthsClamped', () => {
  it('keeps the same day of month when it exists', () => {
    expect(addMonthsClamped('2026-09-05', 1)).toBe('2026-10-05');
    expect(addMonthsClamped('2026-09-05', 3)).toBe('2026-12-05');
  });

  it('clamps to the last day when the target month is shorter', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('measures from the original day, so a short month does not stick', () => {
    // Deriving each date from the previous one would leave every later month
    // on the 28th once February had clamped it.
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('lands on 29 February in a leap year', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('rolls over the year boundary', () => {
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-12-31', 1)).toBe('2027-01-31');
  });

  it('returns the date itself at zero months', () => {
    expect(addMonthsClamped('2026-09-05', 0)).toBe('2026-09-05');
  });
});

describe('buildSchedule', () => {
  const TODAY = '2026-10-01';

  it('divides an even total into equal instalments', () => {
    const rows = buildSchedule(debt(), [], TODAY);
    expect(rows).toHaveLength(24);
    expect(rows.every((r) => r.amount === 500000)).toBe(true);
  });

  it('numbers instalments from one and spaces them monthly', () => {
    const rows = buildSchedule(debt({ instalmentCount: 3 }), [], TODAY);
    expect(rows.map((r) => [r.number, r.dueDate])).toEqual([
      [1, '2026-09-05'],
      [2, '2026-10-05'],
      [3, '2026-11-05']
    ]);
  });

  it('puts the rounding remainder on the last instalment', () => {
    const rows = buildSchedule(debt({ totalAmount: 1000, instalmentCount: 3 }), [], TODAY);
    expect(rows.map((r) => r.amount)).toEqual([333, 333, 334]);
  });

  it('always sums to exactly the total', () => {
    for (const [total, count] of [
      [12000000, 24],
      [1000, 3],
      [999999, 7],
      [5, 4],
      [100, 1]
    ] as const) {
      const rows = buildSchedule(debt({ totalAmount: total, instalmentCount: count }), [], TODAY);
      expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(total);
    }
  });

  it('handles a single-instalment debt', () => {
    const rows = buildSchedule(debt({ totalAmount: 750000, instalmentCount: 1 }), [], TODAY);
    expect(rows).toEqual([
      expect.objectContaining({ number: 1, amount: 750000, dueDate: '2026-09-05' })
    ]);
  });

  it('lets an override replace one amount without disturbing the rest', () => {
    const rows = buildSchedule(debt({ instalmentCount: 3, totalAmount: 300 }), [
      override({ number: 2, amount: 150 })
    ], TODAY);
    expect(rows.map((r) => r.amount)).toEqual([100, 150, 100]);
  });

  it('lets an override replace one due date', () => {
    const rows = buildSchedule(debt({ instalmentCount: 3 }), [
      override({ number: 2, dueDate: '2026-10-20' })
    ], TODAY);
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-09-05', '2026-10-20', '2026-11-05']);
  });

  it('ignores an override pointing outside the schedule', () => {
    const rows = buildSchedule(debt({ instalmentCount: 2 }), [
      override({ number: 9, amount: 1 })
    ], TODAY);
    expect(rows).toHaveLength(2);
  });

  it('marks an instalment paid and carries its transaction', () => {
    const rows = buildSchedule(debt({ instalmentCount: 3 }), [
      override({ number: 1, paidDate: '2026-09-05', transactionId: 'txn-1' })
    ], TODAY);
    expect(rows[0]).toMatchObject({ status: 'paid', paidDate: '2026-09-05', transactionId: 'txn-1' });
  });

  it('calls an unpaid instalment overdue once its date has passed', () => {
    const rows = buildSchedule(debt({ instalmentCount: 3 }), [], TODAY);
    expect(rows[0].status).toBe('overdue'); // 5 Sep, today is 1 Oct
    expect(rows[1].status).toBe('due');
    expect(rows[2].status).toBe('due');
  });

  it('does not call an instalment overdue on its own due date', () => {
    const rows = buildSchedule(debt({ instalmentCount: 2 }), [], '2026-09-05');
    expect(rows[0].status).toBe('due');
  });

  it('never calls a paid instalment overdue, however late it was', () => {
    const rows = buildSchedule(debt({ instalmentCount: 2 }), [
      override({ number: 1, paidDate: '2027-01-01', transactionId: 't' })
    ], '2027-06-01');
    expect(rows[0].status).toBe('paid');
  });
});

describe('summarizeDebt', () => {
  const TODAY = '2026-10-01';

  it('totals what is paid and what remains', () => {
    const rows = buildSchedule(debt({ totalAmount: 300, instalmentCount: 3 }), [
      override({ number: 1, paidDate: '2026-09-05', transactionId: 't' })
    ], TODAY);
    expect(summarizeDebt(rows)).toMatchObject({ paidAmount: 100, remainingAmount: 200, paidCount: 1, count: 3 });
  });

  it('points at the earliest unpaid instalment as next due', () => {
    const rows = buildSchedule(debt({ instalmentCount: 3 }), [
      override({ number: 1, paidDate: '2026-09-05', transactionId: 't' })
    ], TODAY);
    expect(summarizeDebt(rows).nextDue?.number).toBe(2);
  });

  it('reports overdue when any unpaid instalment has passed', () => {
    expect(summarizeDebt(buildSchedule(debt(), [], TODAY)).hasOverdue).toBe(true);
    expect(summarizeDebt(buildSchedule(debt(), [], '2026-08-01')).hasOverdue).toBe(false);
  });

  it('is settled once every instalment is paid', () => {
    const paid = Array.from({ length: 3 }, (_, i) =>
      override({ number: i + 1, paidDate: '2026-09-05', transactionId: `t${i}` })
    );
    const rows = buildSchedule(debt({ totalAmount: 300, instalmentCount: 3 }), paid, TODAY);
    const summary = summarizeDebt(rows);
    expect(summary).toMatchObject({ remainingAmount: 0, isSettled: true, hasOverdue: false });
    expect(summary.nextDue).toBeNull();
  });
});

describe('summarizeAllDebts', () => {
  const TODAY = '2026-10-01';

  function two(): Debt[] {
    return [
      debt({ id: 'd1', name: 'Motorbike loan', totalAmount: 1200, instalmentCount: 4 }),
      debt({ id: 'd2', name: 'Phone', totalAmount: 400, instalmentCount: 4, firstDueDate: '2026-11-05' })
    ];
  }

  it('adds up the totals across every debt', () => {
    const summary = summarizeAllDebts(two(), [], TODAY);
    expect(summary).toMatchObject({ totalAmount: 1600, paidAmount: 0, remainingAmount: 1600 });
  });

  it('counts paid instalments toward the paid total', () => {
    const paid = [
      { id: 'i1', debtId: 'd1', number: 1, paidDate: '2026-09-05', transactionId: 't1', createdAt: 'x' }
    ];
    const summary = summarizeAllDebts(two(), paid, TODAY);
    expect(summary).toMatchObject({ paidAmount: 300, remainingAmount: 1300, paidFraction: 300 / 1600 });
  });

  it('counts how many debts have something overdue, not how many instalments', () => {
    // d1 has two instalments past 1 Oct; it should still count once.
    expect(summarizeAllDebts(two(), [], TODAY).overdueCount).toBe(1);
  });

  it('puts settled debts last and overdue ones first', () => {
    const settled = Array.from({ length: 4 }, (_, i) => ({
      id: `s${i}`, debtId: 'd1', number: i + 1, paidDate: '2026-09-05',
      transactionId: `t${i}`, createdAt: 'x'
    }));
    const rows = summarizeAllDebts(two(), settled, TODAY).rows;
    expect(rows.map((r) => r.debt.id)).toEqual(['d2', 'd1']);
  });

  it('is all zeroes with no debts, and does not divide by zero', () => {
    expect(summarizeAllDebts([], [], TODAY)).toMatchObject({
      totalAmount: 0, paidAmount: 0, remainingAmount: 0, paidFraction: 0, overdueCount: 0
    });
  });
});
