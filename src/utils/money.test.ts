import { describe, it, expect } from 'vitest';
import { formatIDR, parseAmount } from './money';

describe('formatIDR', () => {
  it('groups thousands with dots and prefixes Rp', () => {
    expect(formatIDR(1250000)).toBe('Rp 1.250.000');
  });
  it('formats zero', () => {
    expect(formatIDR(0)).toBe('Rp 0');
  });
  it('formats small values without separators', () => {
    expect(formatIDR(500)).toBe('Rp 500');
  });
  it('places the minus sign before Rp for negatives', () => {
    expect(formatIDR(-1000)).toBe('-Rp 1.000');
  });
  it('rounds non-integer input', () => {
    expect(formatIDR(1000.7)).toBe('Rp 1.001');
  });
});

describe('parseAmount', () => {
  it('strips grouping dots', () => {
    expect(parseAmount('1.250.000')).toBe(1250000);
  });
  it('strips a currency prefix and spaces', () => {
    expect(parseAmount('Rp 25.000')).toBe(25000);
  });
  it('returns 0 for empty input', () => {
    expect(parseAmount('')).toBe(0);
  });
  it('returns 0 for non-numeric input', () => {
    expect(parseAmount('abc')).toBe(0);
  });
  it('round-trips with formatIDR', () => {
    expect(parseAmount(formatIDR(1250000))).toBe(1250000);
  });
});
