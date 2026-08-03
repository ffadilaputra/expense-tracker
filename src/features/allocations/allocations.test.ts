import { describe, it, expect } from 'vitest';
import { currentPeriod, periodsElapsed } from './allocations';
import type { Allocation } from '../../types';

function make(over: Partial<Allocation> = {}): Allocation {
  return {
    id: 'a1',
    name: 'Food',
    icon: '',
    amount: 50000,
    cadence: 'daily',
    intervalDays: 1,
    categories: ['Food'],
    startDate: '2026-08-01',
    openingBalance: 0,
    note: '',
    createdAt: 'ts',
    ...over
  };
}

describe('periodsElapsed', () => {
  it('counts the start date itself as period one', () => {
    expect(periodsElapsed(make(), '2026-08-01')).toBe(1);
  });

  it('counts a day per period when daily', () => {
    expect(periodsElapsed(make(), '2026-08-10')).toBe(10);
  });

  it('counts a week per period when weekly', () => {
    const a = make({ cadence: 'weekly' });
    expect(periodsElapsed(a, '2026-08-07')).toBe(1);
    expect(periodsElapsed(a, '2026-08-08')).toBe(2);
  });

  it('uses intervalDays when the cadence is days', () => {
    const a = make({ cadence: 'days', intervalDays: 10 });
    expect(periodsElapsed(a, '2026-08-10')).toBe(1);
    expect(periodsElapsed(a, '2026-08-11')).toBe(2);
  });

  it('counts calendar months when monthly', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-15' });
    expect(periodsElapsed(a, '2026-01-14')).toBe(0);
    expect(periodsElapsed(a, '2026-01-15')).toBe(1);
    expect(periodsElapsed(a, '2026-02-14')).toBe(1);
    expect(periodsElapsed(a, '2026-02-15')).toBe(2);
    expect(periodsElapsed(a, '2026-04-20')).toBe(4);
  });

  // A monthly envelope anchored past the end of a short month must not skip it.
  it('clamps a month anchor of 31 into February', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-31' });
    expect(periodsElapsed(a, '2026-02-27')).toBe(1);
    expect(periodsElapsed(a, '2026-02-28')).toBe(2);
    expect(periodsElapsed(a, '2026-03-30')).toBe(2);
    expect(periodsElapsed(a, '2026-03-31')).toBe(3);
  });

  it('uses 29 February in a leap year', () => {
    const a = make({ cadence: 'monthly', startDate: '2028-01-31' });
    expect(periodsElapsed(a, '2028-02-28')).toBe(1);
    expect(periodsElapsed(a, '2028-02-29')).toBe(2);
  });

  it('crosses a year boundary', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-11-10' });
    expect(periodsElapsed(a, '2027-01-10')).toBe(3);
  });

  it('reports zero before the envelope starts', () => {
    expect(periodsElapsed(make({ startDate: '2026-09-01' }), '2026-08-15')).toBe(0);
  });
});

describe('currentPeriod', () => {
  it('is the single day when daily', () => {
    expect(currentPeriod(make(), '2026-08-10')).toEqual({
      start: '2026-08-10',
      end: '2026-08-10'
    });
  });

  it('runs from the anchor for a whole week when weekly', () => {
    expect(currentPeriod(make({ cadence: 'weekly' }), '2026-08-09')).toEqual({
      start: '2026-08-08',
      end: '2026-08-14'
    });
  });

  it('runs anchor to the day before the next anchor when monthly', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-15' });
    expect(currentPeriod(a, '2026-03-02')).toEqual({
      start: '2026-02-15',
      end: '2026-03-14'
    });
  });

  it('clamps both ends of a 31st-anchored month', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-31' });
    expect(currentPeriod(a, '2026-02-28')).toEqual({
      start: '2026-02-28',
      end: '2026-03-30'
    });
  });

  it('reports the first period before the envelope starts', () => {
    expect(currentPeriod(make({ startDate: '2026-09-01' }), '2026-08-15')).toEqual({
      start: '2026-09-01',
      end: '2026-09-01'
    });
  });
});
