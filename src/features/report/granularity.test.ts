import { describe, it, expect } from 'vitest';
import { granularityOf, periodSlug, switchGranularity } from './granularity';

// Newest first, matching availableMonths.
const MONTHS = ['2026-08', '2026-05', '2026-02', '2025-11'];
const TODAY = '2026-08-04';

describe('granularityOf', () => {
  it('maps each period kind to its control', () => {
    expect(granularityOf({ kind: 'year', year: '2026' })).toBe('year');
    expect(granularityOf({ kind: 'month', key: '2026-08' })).toBe('month');
    expect(granularityOf({ kind: 'date', date: '2026-08-04' })).toBe('day');
  });
});

describe('switchGranularity to year', () => {
  it('takes the year the month sat in', () => {
    expect(switchGranularity({ kind: 'month', key: '2025-11' }, 'year', MONTHS, TODAY))
      .toEqual({ kind: 'year', year: '2025' });
  });

  it('takes the year the day sat in', () => {
    expect(switchGranularity({ kind: 'date', date: '2025-11-20' }, 'year', MONTHS, TODAY))
      .toEqual({ kind: 'year', year: '2025' });
  });
});

describe('switchGranularity to month', () => {
  it('takes the month the day sat in', () => {
    expect(switchGranularity({ kind: 'date', date: '2026-05-20' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2026-05' });
  });

  it('lands on the newest month with data inside the year', () => {
    expect(switchGranularity({ kind: 'year', year: '2026' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2026-08' });
    expect(switchGranularity({ kind: 'year', year: '2025' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2025-11' });
  });

  it('falls back to January of a year that has no months with data', () => {
    expect(switchGranularity({ kind: 'year', year: '2019' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2019-01' });
  });
});

describe('switchGranularity to day', () => {
  it('takes the first of the month', () => {
    expect(switchGranularity({ kind: 'month', key: '2026-05' }, 'day', MONTHS, TODAY))
      .toEqual({ kind: 'date', date: '2026-05-01' });
  });

  it('takes the first of the year', () => {
    expect(switchGranularity({ kind: 'year', year: '2025' }, 'day', MONTHS, TODAY))
      .toEqual({ kind: 'date', date: '2025-01-01' });
  });

  it('clamps to today, because the day input cannot go past it', () => {
    expect(switchGranularity({ kind: 'month', key: '2026-08' }, 'day', MONTHS, '2026-08-04'))
      .toEqual({ kind: 'date', date: '2026-08-01' });
    expect(switchGranularity({ kind: 'year', year: '2026' }, 'day', MONTHS, '2025-06-01'))
      .toEqual({ kind: 'date', date: '2025-06-01' });
  });

  it('keeps the day it already had', () => {
    expect(switchGranularity({ kind: 'date', date: '2026-05-20' }, 'day', MONTHS, TODAY))
      .toEqual({ kind: 'date', date: '2026-05-20' });
  });
});

describe('periodSlug', () => {
  it('names each period for a filename', () => {
    expect(periodSlug({ kind: 'year', year: '2026' })).toBe('2026');
    expect(periodSlug({ kind: 'month', key: '2026-08' })).toBe('2026-08');
    expect(periodSlug({ kind: 'date', date: '2026-08-04' })).toBe('2026-08-04');
  });
});
