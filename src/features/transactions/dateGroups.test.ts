import { describe, it, expect } from 'vitest';
import { shortDate, weekdayName } from './dateGroups';

describe('weekdayName', () => {
  it('names the weekday in English', () => {
    expect(weekdayName('2026-08-01', 'en')).toBe('Saturday');
    expect(weekdayName('2026-07-30', 'en')).toBe('Thursday');
  });

  it('names the weekday in Indonesian', () => {
    expect(weekdayName('2026-08-01', 'id')).toBe('Sabtu');
    expect(weekdayName('2026-07-31', 'id')).toBe('Jumat');
  });

  it('agrees with the UTC weekday for a date at a month boundary', () => {
    // A calendar date carries no time, so it is parsed and formatted in UTC.
    // Month ends are where a one-day drift would show up first.
    expect(weekdayName('2026-07-31', 'en')).toBe('Friday');
    expect(weekdayName('2026-08-01', 'en')).toBe('Saturday');
  });
});

describe('shortDate', () => {
  it('formats day and month for the locale', () => {
    expect(shortDate('2026-08-01', 'en')).toBe('Aug 1');
    expect(shortDate('2026-01-15', 'en')).toBe('Jan 15');
  });
});
import { groupByDate, relativeDay, sortNewestFirst } from './dateGroups';
import { PAGE_SIZE, pageSlice } from './pagination';
import type { Transaction } from '../../types';

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

describe('sortNewestFirst', () => {
  it('orders by date descending, then createdAt descending', () => {
    const a = tx({ id: 'a', date: '2026-07-24', createdAt: '2026-07-24T08:00:00.000Z' });
    const b = tx({ id: 'b', date: '2026-07-25', createdAt: '2026-07-25T09:00:00.000Z' });
    const c = tx({ id: 'c', date: '2026-07-25', createdAt: '2026-07-25T18:00:00.000Z' });
    expect(sortNewestFirst([a, b, c]).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate the input', () => {
    const rows = [
      tx({ id: 'old', date: '2026-07-01' }),
      tx({ id: 'new', date: '2026-07-31' })
    ];
    sortNewestFirst(rows);
    expect(rows.map((t) => t.id)).toEqual(['old', 'new']);
  });

  // The store hands transactions over in sheet order, which is append order -
  // oldest first. Paging that list unsorted put the oldest rows on page one and
  // hid today's entries behind "load more".
  it('puts the newest rows on the first page', () => {
    const oldestFirst = Array.from({ length: PAGE_SIZE + 10 }, (_, i) =>
      tx({ id: `t${i}`, date: `2026-07-${String(i + 1).padStart(2, '0')}` })
    );
    const page = pageSlice(sortNewestFirst(oldestFirst), 1);
    expect(page.rows[0].id).toBe(`t${PAGE_SIZE + 9}`);
    expect(page.rows.map((t) => t.id)).not.toContain('t0');
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
