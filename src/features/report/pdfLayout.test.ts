import { describe, it, expect } from 'vitest';
import { clip, paginate, rgb, rowsPerPage } from './pdfLayout';

describe('rowsPerPage', () => {
  it('fits whole rows only', () => {
    expect(rowsPerPage(100, 6)).toBe(16);
  });

  it('is zero when not even one row fits', () => {
    expect(rowsPerPage(4, 6)).toBe(0);
  });

  it('never returns a negative count for a negative space', () => {
    expect(rowsPerPage(-20, 6)).toBe(0);
  });

  it('is zero rather than infinite for a zero row height', () => {
    expect(rowsPerPage(100, 0)).toBe(0);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 10 }, (_, i) => i);

  it('returns no pages for no rows', () => {
    expect(paginate([], 3, 5)).toEqual([]);
  });

  it('keeps everything on the first page when it fits exactly', () => {
    expect(paginate([1, 2, 3], 3, 5)).toEqual([[1, 2, 3]]);
  });

  it('spills a single extra row onto a second page', () => {
    expect(paginate([1, 2, 3, 4], 3, 5)).toEqual([[1, 2, 3], [4]]);
  });

  it('uses the larger capacity for every page after the first', () => {
    expect(paginate(rows, 2, 4)).toEqual([[0, 1], [2, 3, 4, 5], [6, 7, 8, 9]]);
  });

  it('starts on a fresh page when the first page has no room at all', () => {
    expect(paginate([1, 2, 3], 0, 2)).toEqual([[1, 2], [3]]);
  });

  it('does not loop forever on a zero page capacity', () => {
    expect(paginate([1, 2, 3], 1, 0)).toEqual([[1], [2], [3]]);
  });
});

describe('rgb', () => {
  it('splits a six-digit hex into channels', () => {
    expect(rgb('#2a78d6')).toEqual([42, 120, 214]);
  });

  it('accepts a hex with no leading hash and surrounding space', () => {
    expect(rgb('  1baf7a ')).toEqual([27, 175, 122]);
  });

  it('expands a three-digit shorthand', () => {
    expect(rgb('#fff')).toEqual([255, 255, 255]);
  });

  it('falls back to black for something unparseable', () => {
    expect(rgb('')).toEqual([0, 0, 0]);
    expect(rgb('not a colour')).toEqual([0, 0, 0]);
  });
});

describe('clip', () => {
  it('leaves text that already fits', () => {
    expect(clip('Groceries', 20)).toBe('Groceries');
  });

  it('marks text it had to cut', () => {
    expect(clip('A very long note indeed', 10)).toBe('A very ...');
  });

  it('produces exactly the requested length when it cuts', () => {
    expect(clip('A very long note indeed', 10)).toHaveLength(10);
  });

  it('drops the marker when there is no room for it', () => {
    expect(clip('abcdef', 3)).toBe('abc');
  });

  it('returns nothing for no room', () => {
    expect(clip('abcdef', 0)).toBe('');
  });
});
