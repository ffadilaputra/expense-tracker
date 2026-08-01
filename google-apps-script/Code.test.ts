import { describe, it, expect } from 'vitest';
import { FakeSheet, loadCode, post, get } from './fakeSheets';

const HEADERS = ['id', 'type', 'amount', 'category', 'date', 'note', 'createdAt'];

describe('header row', () => {
  it('writes headers into a tab the user created by hand', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    api.getSheet();
    expect(api.getSheet().rows[0]).toEqual(HEADERS);
  });

  it('writes headers into a tab this script creates', () => {
    const { api } = loadCode();
    expect(api.getSheet().rows[0]).toEqual(HEADERS);
  });

  it('does not add a second header row on later requests', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    api.getSheet();
    api.getSheet();
    api.getSheet();
    expect(api.getSheet().rows.filter((r) => r[0] === 'id')).toHaveLength(1);
  });

  it('recovers a transaction stranded in row 1 by an earlier version', () => {
    // A sheet damaged before the header fix: the first transaction was
    // appended into row 1, where slice(1) hid it and the row scan skipped it.
    const stranded = ['uuid-a', 'expense', 50000, 'Food', '2026-08-01', '', 'ts'];
    const { api } = loadCode({ sheet: new FakeSheet([stranded]) });

    const listed = get(api, 'list');
    expect(listed.data.map((t: { id: string }) => t.id)).toEqual(['uuid-a']);
  });
});

describe('import (backup restore)', () => {
  const rows = [
    { id: 'keep-1', type: 'expense', amount: 50000, category: 'Food', date: '2026-08-01', note: '', createdAt: 'ts1' },
    { id: 'keep-2', type: 'income', amount: 900000, category: 'Salary', date: '2026-08-02', note: '', createdAt: 'ts2' }
  ];

  it('keeps the ids from the file instead of minting new ones', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });

    const result = post(api, 'import', { transactions: rows });
    expect(result.data.transactions).toEqual({ added: 2, skipped: 0 });
    expect(get(api, 'list').data.map((t: { id: string }) => t.id)).toEqual(['keep-1', 'keep-2']);
  });

  it('skips ids already present rather than duplicating them', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'import', { transactions: rows });

    const second = post(api, 'import', { transactions: rows });
    expect(second.data.transactions).toEqual({ added: 0, skipped: 2 });
    expect(get(api, 'list').data).toHaveLength(2);
  });

  it('merges a file that overlaps existing rows', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'import', { transactions: rows });

    const merged = post(api, 'import', {
      transactions: [rows[1], { ...rows[0], id: 'new-3' }]
    });
    expect(merged.data.transactions).toEqual({ added: 1, skipped: 1 });
    expect(get(api, 'list').data).toHaveLength(3);
  });

  it('imports rows the app can then delete', () => {
    // Ids that round-trip are only useful if the normal actions can find them.
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'import', { transactions: rows });

    expect(post(api, 'delete', { id: 'keep-1' })).toEqual({ success: true });
    expect(get(api, 'list').data.map((t: { id: string }) => t.id)).toEqual(['keep-2']);
  });

  it('writes accounts and transfers into their own tabs', () => {
    const { api, sheets } = loadCode({ sheet: new FakeSheet([]) });

    post(api, 'import', {
      accounts: [{ id: 'acc-1', name: 'BCA', ownerName: 'Budi', icon: '🏦', createdAt: 'ts' }],
      transfers: [
        { id: 'trf-1', fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 500000, date: '2026-08-01', note: '', createdAt: 'ts' }
      ]
    });

    expect(sheets.get('Accounts')!.rows[0]).toEqual(['id', 'name', 'ownerName', 'icon', 'createdAt']);
    expect(sheets.get('Accounts')!.rows[1]).toEqual(['acc-1', 'BCA', 'Budi', '🏦', 'ts']);
    expect(sheets.get('Transfers')!.rows[1][1]).toBe('acc-1');
  });

  it('does not create tabs for collections the file has none of', () => {
    const { api, sheets } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'import', { transactions: rows });

    expect(sheets.has('Accounts')).toBe(false);
    expect(sheets.has('Transfers')).toBe(false);
  });

  it('accepts an empty payload without error', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    expect(post(api, 'import', {})).toEqual({
      success: true,
      data: {
        transactions: { added: 0, skipped: 0 },
        accounts: { added: 0, skipped: 0 },
        transfers: { added: 0, skipped: 0 }
      }
    });
  });

  it('drops rows with no id, which could never be matched again', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const result = post(api, 'import', { transactions: [{ amount: 5, type: 'expense' }] });
    expect(result.data.transactions).toEqual({ added: 0, skipped: 1 });
  });
});

describe('delete against a hand-made tab', () => {
  it('deletes the very first transaction added', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });

    const added = post(api, 'add', { type: 'expense', amount: 50000, category: 'Food', date: '2026-08-01' });
    expect(added.success).toBe(true);

    const removed = post(api, 'delete', { id: added.data.id });
    expect(removed).toEqual({ success: true });
    expect(get(api, 'list').data).toEqual([]);
  });

  it('updates the very first transaction added', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const added = post(api, 'add', { type: 'expense', amount: 50000, category: 'Food', date: '2026-08-01' });

    const updated = post(api, 'update', { id: added.data.id, amount: 75000 });
    expect(updated.success).toBe(true);
    expect(get(api, 'list').data[0].amount).toBe(75000);
  });

  it('still reports not found for an id that is genuinely absent', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'add', { type: 'expense', amount: 1, category: 'Food', date: '2026-08-01' });

    expect(post(api, 'delete', { id: 'no-such-id' })).toEqual({
      success: false,
      error: 'Transaction not found'
    });
  });

  it('deletes the right row when several transactions exist', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const a = post(api, 'add', { type: 'expense', amount: 1, category: 'A', date: '2026-08-01' });
    const b = post(api, 'add', { type: 'expense', amount: 2, category: 'B', date: '2026-08-02' });
    const c = post(api, 'add', { type: 'income', amount: 3, category: 'C', date: '2026-08-03' });

    post(api, 'delete', { id: b.data.id });

    expect(get(api, 'list').data.map((t: { id: string }) => t.id)).toEqual([a.data.id, c.data.id]);
  });
});
