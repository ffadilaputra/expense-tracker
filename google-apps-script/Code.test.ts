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
