import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, pageSlice } from './pagination';

const items = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('pageSlice', () => {
  it('shows one page by default', () => {
    const page = pageSlice(items(100), 1);
    expect(page.rows).toHaveLength(PAGE_SIZE);
    expect(page.remaining).toBe(70);
    expect(page.hasMore).toBe(true);
  });

  it('grows by a whole page at a time', () => {
    expect(pageSlice(items(100), 2).rows).toHaveLength(60);
    expect(pageSlice(items(100), 3).rows).toHaveLength(90);
  });

  it('reports nothing remaining when the last page exactly fills', () => {
    const page = pageSlice(items(60), 2);
    expect(page.rows).toHaveLength(60);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  it('does not pad when there are fewer items than one page', () => {
    const page = pageSlice(items(7), 1);
    expect(page.rows).toHaveLength(7);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  it('handles an empty list', () => {
    const page = pageSlice([], 1);
    expect(page.rows).toEqual([]);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  // A page count past the end must not produce a negative "remaining", which
  // would render as "Load more (-14 remaining)".
  it('clamps a page count past the end', () => {
    const page = pageSlice(items(10), 99);
    expect(page.rows).toHaveLength(10);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  it('treats a page count below one as a single page', () => {
    expect(pageSlice(items(100), 0).rows).toHaveLength(PAGE_SIZE);
  });
});
