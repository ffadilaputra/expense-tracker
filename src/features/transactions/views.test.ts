import { describe, it, expect } from 'vitest';
import { applyView, makeViewId, normalizeView, ALL_VIEW, type View } from './views';
import { applyCategoryFilter, UNCATEGORIZED } from './categoryChips';
import type { Transaction } from '../../types';

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    type: 'expense',
    amount: 10000,
    category: 'Food',
    date: '2026-08-01',
    note: '',
    createdAt: 'ts',
    accountId: '',
    ...over
  };
}

function mk(over: Partial<View> = {}): View {
  return { id: 'v1', name: 'Daily needs', categories: [], type: 'all', ...over };
}

const rows = [
  txn({ id: 'a', type: 'expense', category: 'Food' }),
  txn({ id: 'b', type: 'expense', category: 'Transport' }),
  txn({ id: 'c', type: 'income', category: 'Salary' }),
  txn({ id: 'd', type: 'income', category: 'Gift' }),
  txn({ id: 'e', type: 'expense', category: '' })
];

const ids = (list: Transaction[]) => list.map((t) => t.id);

describe('applyView', () => {
  it('passes everything through for the All view', () => {
    expect(ids(applyView(rows, ALL_VIEW))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps only expenses when the type is expense', () => {
    expect(ids(applyView(rows, mk({ type: 'expense' })))).toEqual(['a', 'b', 'e']);
  });

  it('keeps only income when the type is income', () => {
    expect(ids(applyView(rows, mk({ type: 'income' })))).toEqual(['c', 'd']);
  });

  // The rule that makes an "Income" view survive inventing a new category.
  it('treats an empty category list as every category of that type', () => {
    expect(ids(applyView(rows, mk({ type: 'income', categories: [] })))).toEqual(['c', 'd']);
  });

  it('filters to the listed categories', () => {
    const view = mk({ type: 'expense', categories: ['Food', 'Transport'] });
    expect(ids(applyView(rows, view))).toEqual(['a', 'b']);
  });

  it('matches categories exactly, so Food and food stay distinct', () => {
    expect(ids(applyView(rows, mk({ categories: ['food'] })))).toEqual([]);
  });

  it('ignores surrounding whitespace on the transaction side', () => {
    const spaced = [txn({ id: 'x', category: '  Food  ' })];
    expect(ids(applyView(spaced, mk({ categories: ['Food'] })))).toEqual(['x']);
  });

  // The sentinel carries a leading space on purpose; it must not be trimmed.
  it('matches blank-category transactions via the uncategorized sentinel', () => {
    expect(ids(applyView(rows, mk({ categories: [UNCATEGORIZED] })))).toEqual(['e']);
  });

  it('returns nothing when none of the listed categories are in use', () => {
    expect(ids(applyView(rows, mk({ categories: ['Yacht'] })))).toEqual([]);
  });

  it('applies type and categories together', () => {
    const view = mk({ type: 'income', categories: ['Gift'] });
    expect(ids(applyView(rows, view))).toEqual(['d']);
  });
});

describe('normalizeView', () => {
  const good = { id: 'v1', name: 'Daily needs', categories: ['Food'], type: 'expense' };

  it('round-trips a well-formed object', () => {
    expect(normalizeView(good)).toEqual(good);
  });

  it('trims the name', () => {
    expect(normalizeView({ ...good, name: '  Daily needs  ' })!.name).toBe('Daily needs');
  });

  it('rejects a missing or empty id', () => {
    expect(normalizeView({ ...good, id: undefined })).toBeNull();
    expect(normalizeView({ ...good, id: '' })).toBeNull();
  });

  it('rejects a missing or blank name', () => {
    expect(normalizeView({ ...good, name: undefined })).toBeNull();
    expect(normalizeView({ ...good, name: '   ' })).toBeNull();
  });

  it('rejects categories that are not an array', () => {
    expect(normalizeView({ ...good, categories: 'Food' })).toBeNull();
  });

  it('rejects an unknown type', () => {
    expect(normalizeView({ ...good, type: 'savings' })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(normalizeView(null)).toBeNull();
    expect(normalizeView('view')).toBeNull();
    expect(normalizeView(42)).toBeNull();
  });

  it('drops non-string and empty category entries', () => {
    const v = normalizeView({ ...good, categories: ['Food', 7, '', null, 'Transport'] });
    expect(v!.categories).toEqual(['Food', 'Transport']);
  });

  // Trimming here would destroy the sentinel's leading space.
  it('preserves the uncategorized sentinel verbatim', () => {
    const v = normalizeView({ ...good, categories: [UNCATEGORIZED] });
    expect(v!.categories).toEqual([UNCATEGORIZED]);
  });
});

describe('makeViewId', () => {
  it('produces distinct ids', () => {
    expect(makeViewId()).not.toBe(makeViewId());
  });

  it('is prefixed so it is recognisable in storage', () => {
    expect(makeViewId().startsWith('view-')).toBe(true);
  });
});

// The property the screen depends on: period -> view -> chip narrows to the
// same set as a single combined predicate, so the stages cannot disagree about
// what is on screen.
describe('composing a view with a category chip', () => {
  const view: View = { id: 'v1', name: 'Spending', categories: [], type: 'expense' };
  const chip = { category: 'Food', type: 'expense' as const };

  it('matches the combined predicate', () => {
    const composed = applyCategoryFilter(applyView(rows, view), chip);
    const direct = rows.filter((t) => t.type === 'expense' && t.category === 'Food');
    expect(ids(composed)).toEqual(ids(direct));
  });

  it('gives the same answer in either order', () => {
    const viewFirst = applyCategoryFilter(applyView(rows, view), chip);
    const chipFirst = applyView(applyCategoryFilter(rows, chip), view);
    expect(ids(viewFirst)).toEqual(ids(chipFirst));
  });
});
