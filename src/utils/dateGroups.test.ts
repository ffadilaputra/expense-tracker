import { describe, it, expect } from 'vitest';
import { groupByDate, relativeDay } from './dateGroups';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('groupByDate', () => {
  it('groups by date, newest date first, newest createdAt first within a day', () => {
    const a = tx({ id: 'a', date: '2026-07-24', createdAt: '2026-07-24T08:00:00.000Z' });
    const b = tx({ id: 'b', date: '2026-07-25', createdAt: '2026-07-25T09:00:00.000Z' });
    const c = tx({ id: 'c', date: '2026-07-25', createdAt: '2026-07-25T18:00:00.000Z' });
    const groups = groupByDate([a, b, c]);
    expect(groups.map((g) => g.date)).toEqual(['2026-07-25', '2026-07-24']);
    expect(groups[0].items.map((t) => t.id)).toEqual(['c', 'b']);
  });
  it('returns empty array for no transactions', () => {
    expect(groupByDate([])).toEqual([]);
  });
});

describe('relativeDay', () => {
  it('detects today', () => {
    expect(relativeDay('2026-07-25', '2026-07-25')).toBe('today');
  });
  it('detects yesterday', () => {
    expect(relativeDay('2026-07-24', '2026-07-25')).toBe('yesterday');
  });
  it('returns null for older dates', () => {
    expect(relativeDay('2026-07-01', '2026-07-25')).toBeNull();
  });
});
