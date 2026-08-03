import { describe, it, expect } from 'vitest';
import {
  deriveCategories,
  applyCategoryFilter,
  chipWindow,
  sameChip,
  CHIP_LIMIT,
  UNCATEGORIZED,
  type CategoryChip
} from './categoryChips';
import type { Transaction, TransactionType } from '../../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('deriveCategories', () => {
  it('returns one chip per distinct category, deduplicated', () => {
    const chips = deriveCategories([
      tx({ category: 'Food' }),
      tx({ category: 'Food' }),
      tx({ category: 'Transport' })
    ]);
    expect(chips).toEqual([
      { category: 'Food', type: 'expense' },
      { category: 'Transport', type: 'expense' }
    ]);
  });

  it('treats the same name under both types as two chips', () => {
    const chips = deriveCategories([
      tx({ category: 'Gift', type: 'expense' }),
      tx({ category: 'Gift', type: 'income' })
    ]);
    expect(chips).toEqual([
      { category: 'Gift', type: 'expense' },
      { category: 'Gift', type: 'income' }
    ]);
  });

  it('puts every expense chip before every income chip', () => {
    const chips = deriveCategories([
      tx({ category: 'Salary', type: 'income' }),
      tx({ category: 'Transport', type: 'expense' })
    ]);
    expect(chips.map((c) => c.type)).toEqual(['expense', 'income']);
  });

  it('sorts alphabetically within each type group', () => {
    const chips = deriveCategories([
      tx({ category: 'Transport' }),
      tx({ category: 'Bills' }),
      tx({ category: 'Food' }),
      tx({ category: 'Gift', type: 'income' }),
      tx({ category: 'Bonus', type: 'income' })
    ]);
    expect(chips.map((c) => c.category)).toEqual(['Bills', 'Food', 'Transport', 'Bonus', 'Gift']);
  });

  it('collapses blank and whitespace-only categories into one uncategorized chip per type', () => {
    const chips = deriveCategories([
      tx({ category: '' }),
      tx({ category: '   ' }),
      tx({ category: '', type: 'income' })
    ]);
    expect(chips).toEqual([
      { category: UNCATEGORIZED, type: 'expense' },
      { category: UNCATEGORIZED, type: 'income' }
    ]);
  });

  it('sorts the uncategorized chip last within its group', () => {
    const chips = deriveCategories([tx({ category: '' }), tx({ category: 'Zebra' })]);
    expect(chips.map((c) => c.category)).toEqual(['Zebra', UNCATEGORIZED]);
  });

  it('returns nothing for empty input', () => {
    expect(deriveCategories([])).toEqual([]);
  });
});

describe('applyCategoryFilter', () => {
  const txns = [
    tx({ id: 'a', category: 'Gift', type: 'expense' }),
    tx({ id: 'b', category: 'Gift', type: 'income' }),
    tx({ id: 'c', category: 'Food', type: 'expense' }),
    tx({ id: 'd', category: '  ', type: 'expense' })
  ];

  it('returns everything when no chip is selected', () => {
    expect(applyCategoryFilter(txns, null)).toBe(txns);
  });

  it('matches on category and type together', () => {
    const kept = applyCategoryFilter(txns, { category: 'Gift', type: 'expense' });
    expect(kept.map((t) => t.id)).toEqual(['a']);
  });

  it('matches blank categories via the uncategorized chip', () => {
    const kept = applyCategoryFilter(txns, { category: UNCATEGORIZED, type: 'expense' });
    expect(kept.map((t) => t.id)).toEqual(['d']);
  });

  it('returns nothing when the chip matches no transaction', () => {
    expect(applyCategoryFilter(txns, { category: 'Bills', type: 'expense' })).toEqual([]);
  });
});

describe('sameChip', () => {
  it('is true only when category and type both match', () => {
    const a = { category: 'Food', type: 'expense' } as const;
    expect(sameChip(a, { category: 'Food', type: 'expense' })).toBe(true);
    expect(sameChip(a, { category: 'Food', type: 'income' })).toBe(false);
    expect(sameChip(a, { category: 'Bills', type: 'expense' })).toBe(false);
  });

  it('is false when either side is null', () => {
    expect(sameChip(null, { category: 'Food', type: 'expense' })).toBe(false);
    expect(sameChip({ category: 'Food', type: 'expense' }, null)).toBe(false);
    expect(sameChip(null, null)).toBe(false);
  });
});

describe('chipWindow', () => {
  const chip = (category: string, type: TransactionType = 'expense'): CategoryChip => ({
    category,
    type
  });

  const many = Array.from({ length: 10 }, (_, i) => chip(`C${i}`));

  it('shows everything when there are fewer chips than the limit', () => {
    const window = chipWindow(many.slice(0, 4), null, false);
    expect(window.shown).toHaveLength(4);
    expect(window.overflowing).toBe(false);
    expect(window.hiddenCount).toBe(0);
  });

  // The boundary: exactly the limit must not sprout a "more" control that
  // reveals nothing.
  it('does not overflow at exactly the limit', () => {
    const window = chipWindow(many.slice(0, CHIP_LIMIT), null, false);
    expect(window.shown).toHaveLength(CHIP_LIMIT);
    expect(window.overflowing).toBe(false);
    expect(window.hiddenCount).toBe(0);
  });

  it('overflows one past the limit', () => {
    const window = chipWindow(many.slice(0, CHIP_LIMIT + 1), null, false);
    expect(window.shown).toHaveLength(CHIP_LIMIT);
    expect(window.overflowing).toBe(true);
    expect(window.hiddenCount).toBe(1);
  });

  it('reports the hidden count', () => {
    expect(chipWindow(many, null, false).hiddenCount).toBe(4);
  });

  it('shows everything when expanded', () => {
    const window = chipWindow(many, null, true);
    expect(window.shown).toEqual(many);
    expect(window.hiddenCount).toBe(0);
    expect(window.overflowing).toBe(true);
  });

  it('keeps a selected chip that falls inside the head', () => {
    const window = chipWindow(many, many[2], false);
    expect(window.shown).toHaveLength(CHIP_LIMIT);
    expect(window.shown).toContainEqual(many[2]);
  });

  // Collapsing must never hide the active filter - the list would stay
  // narrowed with nothing on screen explaining why.
  it('rescues a selected chip that falls past the cut', () => {
    const window = chipWindow(many, many[8], false);
    expect(window.shown).toHaveLength(CHIP_LIMIT + 1);
    expect(window.shown[CHIP_LIMIT]).toEqual(many[8]);
    // One of the hidden chips is now on screen, so it is not still counted.
    expect(window.hiddenCount).toBe(3);
  });

  it('matches the selected chip on type as well as category', () => {
    const chips = [...many.slice(0, CHIP_LIMIT), chip('C0', 'income')];
    const window = chipWindow(chips, chip('C0', 'income'), false);
    expect(window.shown).toContainEqual(chip('C0', 'income'));
    expect(window.shown).toHaveLength(CHIP_LIMIT + 1);
  });

  it('handles an empty list', () => {
    expect(chipWindow([], null, false)).toEqual({
      shown: [],
      hiddenCount: 0,
      overflowing: false
    });
  });
});
