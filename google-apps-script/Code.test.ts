import { describe, it, expect } from 'vitest';
import { FakeSheet, loadCode, post, get } from './fakeSheets';

const HEADERS = ['id', 'type', 'amount', 'category', 'date', 'note', 'createdAt', 'accountId'];
const OLD_HEADERS = ['id', 'type', 'amount', 'category', 'date', 'note', 'createdAt'];

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
    expect(listed.data.transactions.map((t: { id: string }) => t.id)).toEqual(['uuid-a']);
  });
});

describe('migrating a live sheet to the accountId column', () => {
  const oldRows = [
    OLD_HEADERS,
    ['t1', 'expense', 50000, 'Food', '2026-08-01', 'Lunch', 'ts1'],
    ['t2', 'income', 900000, 'Salary', '2026-08-02', '', 'ts2']
  ];

  it('adds the new column to a header written by an older version', () => {
    const { api } = loadCode({ sheet: new FakeSheet(oldRows) });
    expect(api.getSheet().rows[0]).toEqual(HEADERS);
  });

  it('leaves existing data rows untouched', () => {
    const { api } = loadCode({ sheet: new FakeSheet(oldRows) });
    api.getSheet();
    const sheet = api.getSheet();
    expect(sheet.rows[1].slice(0, 7)).toEqual(oldRows[1]);
    expect(sheet.rows[2].slice(0, 7)).toEqual(oldRows[2]);
  });

  it('reads pre-existing rows as unassigned rather than dropping them', () => {
    const { api } = loadCode({ sheet: new FakeSheet(oldRows) });
    const listed = get(api, 'list');
    expect(listed.data.transactions).toHaveLength(2);
    expect(listed.data.transactions[0].accountId).toBe('');
  });

  it('does not rewrite a header that is already current', () => {
    const { api } = loadCode({ sheet: new FakeSheet([HEADERS, oldRows[1].concat(['acc-1'])]) });
    const sheet = api.getSheet();
    expect(sheet.rows[0]).toEqual(HEADERS);
    expect(sheet.rows[1][7]).toBe('acc-1');
  });

  it('round-trips accountId through add and update', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });

    const added = post(api, 'add', {
      type: 'expense', amount: 50000, category: 'Food', date: '2026-08-01', accountId: 'acc-1'
    });
    expect(added.data.accountId).toBe('acc-1');

    const updated = post(api, 'update', { id: added.data.id, accountId: 'acc-2' });
    expect(updated.data.accountId).toBe('acc-2');
    expect(updated.data.amount).toBe(50000);
  });

  it('keeps accountId when an unrelated field is updated', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const added = post(api, 'add', {
      type: 'expense', amount: 1, category: 'Food', date: '2026-08-01', accountId: 'acc-1'
    });

    const updated = post(api, 'update', { id: added.data.id, amount: 999 });
    expect(updated.data.accountId).toBe('acc-1');
  });
});

describe('account CRUD', () => {
  it('creates an account in the Accounts tab, not the Transactions tab', () => {
    const { api, sheets } = loadCode({ sheet: new FakeSheet([]) });

    const created = post(api, 'addAccount', { name: 'BCA', ownerName: 'Budi', icon: '🏦' });
    expect(created.success).toBe(true);
    expect(created.data).toMatchObject({ name: 'BCA', ownerName: 'Budi', icon: '🏦' });

    expect(sheets.get('Accounts')!.rows[1][1]).toBe('BCA');
    expect(api.getSheet().rows).toHaveLength(1); // header only
  });

  it('returns accounts from the combined list', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'addAccount', { name: 'Cash', ownerName: 'Budi' });

    const listed = get(api, 'list');
    expect(listed.data.accounts).toHaveLength(1);
    expect(listed.data.accounts[0].name).toBe('Cash');
  });

  it('lists no accounts and creates no tab before any exist', () => {
    const { api, sheets } = loadCode({ sheet: new FakeSheet([]) });

    expect(get(api, 'list').data.accounts).toEqual([]);
    expect(sheets.has('Accounts')).toBe(false);
  });

  it('updates a name without disturbing the owner', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const created = post(api, 'addAccount', { name: 'BCA', ownerName: 'Budi' });

    const updated = post(api, 'updateAccount', { id: created.data.id, name: 'BCA Digital' });
    expect(updated.data).toMatchObject({ name: 'BCA Digital', ownerName: 'Budi' });
  });

  it('deletes an account nothing refers to', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const created = post(api, 'addAccount', { name: 'Unused' });

    expect(post(api, 'deleteAccount', { id: created.data.id })).toEqual({ success: true });
    expect(get(api, 'list').data.accounts).toEqual([]);
  });

  it('refuses to delete an account a transaction still points at', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const created = post(api, 'addAccount', { name: 'BCA' });
    post(api, 'add', {
      type: 'expense', amount: 1, category: 'Food', date: '2026-08-01', accountId: created.data.id
    });

    const refused = post(api, 'deleteAccount', { id: created.data.id });
    expect(refused.success).toBe(false);
    expect(refused.data.uses).toBe(1);
    expect(get(api, 'list').data.accounts).toHaveLength(1);
  });

  it('allows the delete once the referring transaction is reassigned', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const created = post(api, 'addAccount', { name: 'BCA' });
    const txn = post(api, 'add', {
      type: 'expense', amount: 1, category: 'Food', date: '2026-08-01', accountId: created.data.id
    });

    post(api, 'update', { id: txn.data.id, accountId: '' });
    expect(post(api, 'deleteAccount', { id: created.data.id })).toEqual({ success: true });
  });

  it('reports not found for an account that does not exist', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'addAccount', { name: 'BCA' });

    expect(post(api, 'deleteAccount', { id: 'nope' }).success).toBe(false);
    expect(post(api, 'updateAccount', { id: 'nope', name: 'x' }).success).toBe(false);
  });
});

describe('transfers', () => {
  function withTwoAccounts() {
    const loaded = loadCode({ sheet: new FakeSheet([]) });
    const a = post(loaded.api, 'addAccount', { name: 'BCA' }).data.id;
    const b = post(loaded.api, 'addAccount', { name: 'Cash' }).data.id;
    return { ...loaded, a, b };
  }

  it('records a transfer in the Transfers tab', () => {
    const { api, sheets, a, b } = withTwoAccounts();

    const created = post(api, 'addTransfer', {
      fromAccountId: a, toAccountId: b, amount: 500000, date: '2026-08-01', note: 'Top up'
    });

    expect(created.success).toBe(true);
    expect(created.data).toMatchObject({ fromAccountId: a, toAccountId: b, amount: 500000, note: 'Top up' });
    expect(sheets.get('Transfers')!.rows[1][1]).toBe(a);
  });

  it('returns transfers from the combined list', () => {
    const { api, a, b } = withTwoAccounts();
    post(api, 'addTransfer', { fromAccountId: a, toAccountId: b, amount: 1, date: '2026-08-01' });

    expect(get(api, 'list').data.transfers).toHaveLength(1);
  });

  it('refuses a transfer to the same account', () => {
    const { api, a } = withTwoAccounts();

    const refused = post(api, 'addTransfer', {
      fromAccountId: a, toAccountId: a, amount: 500000, date: '2026-08-01'
    });
    expect(refused.success).toBe(false);
    expect(get(api, 'list').data.transfers).toEqual([]);
  });

  it('refuses a transfer with a missing end', () => {
    const { api, a } = withTwoAccounts();
    expect(post(api, 'addTransfer', { fromAccountId: a, amount: 1, date: '2026-08-01' }).success).toBe(false);
  });

  it('refuses a zero or negative amount', () => {
    const { api, a, b } = withTwoAccounts();
    expect(post(api, 'addTransfer', { fromAccountId: a, toAccountId: b, amount: 0 }).success).toBe(false);
    expect(post(api, 'addTransfer', { fromAccountId: a, toAccountId: b, amount: -5 }).success).toBe(false);
  });

  it('deletes a transfer', () => {
    const { api, a, b } = withTwoAccounts();
    const created = post(api, 'addTransfer', {
      fromAccountId: a, toAccountId: b, amount: 1, date: '2026-08-01'
    });

    expect(post(api, 'deleteTransfer', { id: created.data.id })).toEqual({ success: true });
    expect(get(api, 'list').data.transfers).toEqual([]);
  });

  it('reports not found for a transfer that does not exist', () => {
    const { api } = withTwoAccounts();
    expect(post(api, 'deleteTransfer', { id: 'nope' }).success).toBe(false);
  });

  it('blocks deleting an account a transfer still references', () => {
    const { api, a, b } = withTwoAccounts();
    post(api, 'addTransfer', { fromAccountId: a, toAccountId: b, amount: 1, date: '2026-08-01' });

    const refused = post(api, 'deleteAccount', { id: a });
    expect(refused.success).toBe(false);
    expect(refused.data.uses).toBe(1);
  });
});

describe('debts', () => {
  function withDebt() {
    const loaded = loadCode({ sheet: new FakeSheet([]) });
    const debt = post(loaded.api, 'addDebt', {
      name: 'Motorbike loan', totalAmount: 12000000, instalmentCount: 24, firstDueDate: '2026-09-05'
    });
    return { ...loaded, debtId: debt.data.id, debt };
  }

  it('creates a debt in its own tab', () => {
    const { sheets, debt } = withDebt();
    expect(debt.data).toMatchObject({
      name: 'Motorbike loan', totalAmount: 12000000, instalmentCount: 24, firstDueDate: '2026-09-05'
    });
    expect(sheets.get('Debts')!.rows[0]).toEqual(
      ['id', 'name', 'totalAmount', 'instalmentCount', 'firstDueDate', 'note', 'createdAt']
    );
  });

  it('returns debts and instalments from the combined list', () => {
    const { api, debtId } = withDebt();
    post(api, 'saveInstalment', { debtId, number: 1, paidDate: '2026-09-05', transactionId: 't1' });

    const listed = get(api, 'list');
    expect(listed.data.debts).toHaveLength(1);
    expect(listed.data.debtInstalments).toHaveLength(1);
  });

  it('creates no debt tabs before any debt exists', () => {
    const { api, sheets } = loadCode({ sheet: new FakeSheet([]) });
    expect(get(api, 'list').data.debts).toEqual([]);
    expect(sheets.has('Debts')).toBe(false);
    expect(sheets.has('DebtInstalments')).toBe(false);
  });

  it('updates a debt without disturbing untouched fields', () => {
    const { api, debtId } = withDebt();
    const updated = post(api, 'updateDebt', { id: debtId, totalAmount: 13000000 });
    expect(updated.data).toMatchObject({ name: 'Motorbike loan', totalAmount: 13000000, instalmentCount: 24 });
  });

  it('upserts an instalment on debt and number rather than duplicating', () => {
    const { api, debtId } = withDebt();
    post(api, 'saveInstalment', { debtId, number: 3, amount: 512400 });
    post(api, 'saveInstalment', { debtId, number: 3, paidDate: '2026-11-05', transactionId: 't9' });

    const rows = get(api, 'list').data.debtInstalments;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ number: 3, paidDate: '2026-11-05', transactionId: 't9' });
  });

  it('keeps a blank override distinct from zero', () => {
    // '' means "not overridden"; 0 would be a real instalment of nothing.
    const { api, debtId } = withDebt();
    post(api, 'saveInstalment', { debtId, number: 2, paidDate: '2026-10-05' });
    expect(get(api, 'list').data.debtInstalments[0].amount).toBeNull();
  });

  it('deletes a debt that has paid instalments, taking the rows with it', () => {
    const { api, debtId } = withDebt();
    post(api, 'saveInstalment', { debtId, number: 1, paidDate: '2026-09-05', transactionId: 't1' });

    expect(post(api, 'deleteDebt', { id: debtId })).toEqual({ success: true });
    expect(get(api, 'list').data.debts).toEqual([]);
    expect(get(api, 'list').data.debtInstalments).toEqual([]);
  });

  it('leaves another debt’s instalments alone when one is deleted', () => {
    const { api, debtId } = withDebt();
    const other = post(api, 'addDebt', {
      name: 'Phone', totalAmount: 100, instalmentCount: 2, firstDueDate: '2026-09-05'
    }).data.id;
    post(api, 'saveInstalment', { debtId, number: 1, paidDate: '2026-09-05', transactionId: 't1' });
    post(api, 'saveInstalment', { debtId: other, number: 1, amount: 50 });

    post(api, 'deleteDebt', { id: debtId });
    const left = get(api, 'list').data.debtInstalments;
    expect(left).toHaveLength(1);
    expect(left[0].debtId).toBe(other);
  });

  it('deletes a debt with only unpaid overrides, clearing them too', () => {
    const { api, debtId } = withDebt();
    post(api, 'saveInstalment', { debtId, number: 4, amount: 480000 });

    expect(post(api, 'deleteDebt', { id: debtId })).toEqual({ success: true });
    expect(get(api, 'list').data.debts).toEqual([]);
    expect(get(api, 'list').data.debtInstalments).toEqual([]);
  });

  it('deletes a single instalment row', () => {
    const { api, debtId } = withDebt();
    const saved = post(api, 'saveInstalment', { debtId, number: 1, amount: 1 });
    expect(post(api, 'deleteInstalment', { id: saved.data.id })).toEqual({ success: true });
    expect(get(api, 'list').data.debtInstalments).toEqual([]);
  });
});

describe('add with a supplied id', () => {
  it('keeps the id it is given', () => {
    // A debt payment writes the expense and the instalment row together, so
    // both have to agree on the id before either reaches the sheet.
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const added = post(api, 'add', {
      id: 'chosen-1', type: 'expense', amount: 500000, category: 'Motorbike loan', date: '2026-09-05'
    });

    expect(added.data.id).toBe('chosen-1');
    expect(post(api, 'delete', { id: 'chosen-1' })).toEqual({ success: true });
  });

  it('still mints one when none is supplied', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const added = post(api, 'add', { type: 'expense', amount: 1, category: 'Food', date: '2026-09-05' });
    expect(added.data.id).toMatch(/^uuid-/);
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
    expect(get(api, 'list').data.transactions.map((t: { id: string }) => t.id)).toEqual(['keep-1', 'keep-2']);
  });

  it('skips ids already present rather than duplicating them', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'import', { transactions: rows });

    const second = post(api, 'import', { transactions: rows });
    expect(second.data.transactions).toEqual({ added: 0, skipped: 2 });
    expect(get(api, 'list').data.transactions).toHaveLength(2);
  });

  it('merges a file that overlaps existing rows', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'import', { transactions: rows });

    const merged = post(api, 'import', {
      transactions: [rows[1], { ...rows[0], id: 'new-3' }]
    });
    expect(merged.data.transactions).toEqual({ added: 1, skipped: 1 });
    expect(get(api, 'list').data.transactions).toHaveLength(3);
  });

  it('imports rows the app can then delete', () => {
    // Ids that round-trip are only useful if the normal actions can find them.
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    post(api, 'import', { transactions: rows });

    expect(post(api, 'delete', { id: 'keep-1' })).toEqual({ success: true });
    expect(get(api, 'list').data.transactions.map((t: { id: string }) => t.id)).toEqual(['keep-2']);
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
    expect(get(api, 'list').data.transactions).toEqual([]);
  });

  it('updates the very first transaction added', () => {
    const { api } = loadCode({ sheet: new FakeSheet([]) });
    const added = post(api, 'add', { type: 'expense', amount: 50000, category: 'Food', date: '2026-08-01' });

    const updated = post(api, 'update', { id: added.data.id, amount: 75000 });
    expect(updated.success).toBe(true);
    expect(get(api, 'list').data.transactions[0].amount).toBe(75000);
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

    expect(get(api, 'list').data.transactions.map((t: { id: string }) => t.id)).toEqual([a.data.id, c.data.id]);
  });
});

describe('savings', () => {
  function withGoal() {
    const loaded = loadCode({ sheet: new FakeSheet([]) });
    const goal = post(loaded.api, 'addSaving', {
      name: 'Umrah', icon: '🕌', targetAmount: 20000000
    });
    return { ...loaded, savingId: goal.data.id, goal };
  }

  it('creates a goal in its own tab', () => {
    const { sheets, goal } = withGoal();
    expect(goal.data).toMatchObject({ name: 'Umrah', icon: '🕌', targetAmount: 20000000 });
    expect(sheets.get('Savings')!.rows[0]).toEqual(
      ['id', 'name', 'icon', 'targetAmount', 'note', 'createdAt']
    );
  });

  it('returns goals and contributions from the combined list', () => {
    const { api, savingId } = withGoal();
    post(api, 'addContribution', { savingId, amount: 500000, date: '2026-08-02' });

    const listed = get(api, 'list');
    expect(listed.data.savings).toHaveLength(1);
    expect(listed.data.savingContributions).toHaveLength(1);
  });

  it('creates no savings tabs before a goal exists', () => {
    const { api, sheets } = loadCode({ sheet: new FakeSheet([]) });
    expect(get(api, 'list').data.savings).toEqual([]);
    expect(sheets.has('Savings')).toBe(false);
    expect(sheets.has('SavingContributions')).toBe(false);
  });

  it('keeps each contribution as its own row', () => {
    const { api, savingId } = withGoal();
    post(api, 'addContribution', { savingId, amount: 100, date: '2026-08-01' });
    post(api, 'addContribution', { savingId, amount: 200, date: '2026-08-02' });

    expect(get(api, 'list').data.savingContributions).toHaveLength(2);
  });

  it('updates a target without disturbing the icon', () => {
    const { api, savingId } = withGoal();
    const updated = post(api, 'updateSaving', { id: savingId, targetAmount: 25000000 });
    expect(updated.data).toMatchObject({ name: 'Umrah', icon: '🕌', targetAmount: 25000000 });
  });

  it('deletes a goal and its contributions together', () => {
    // Safe to cascade: a contribution is an earmark, not a ledger entry.
    const { api, savingId } = withGoal();
    post(api, 'addContribution', { savingId, amount: 100, date: '2026-08-01' });
    post(api, 'addContribution', { savingId, amount: 200, date: '2026-08-02' });

    expect(post(api, 'deleteSaving', { id: savingId })).toEqual({ success: true });
    expect(get(api, 'list').data.savings).toEqual([]);
    expect(get(api, 'list').data.savingContributions).toEqual([]);
  });

  it('leaves another goal’s contributions alone when one is deleted', () => {
    const { api, savingId } = withGoal();
    const other = post(api, 'addSaving', { name: 'Laptop', targetAmount: 9000000 }).data.id;
    post(api, 'addContribution', { savingId, amount: 100, date: '2026-08-01' });
    post(api, 'addContribution', { savingId: other, amount: 300, date: '2026-08-01' });

    post(api, 'deleteSaving', { id: savingId });
    const left = get(api, 'list').data.savingContributions;
    expect(left).toHaveLength(1);
    expect(left[0].savingId).toBe(other);
  });

  it('deletes a single contribution', () => {
    const { api, savingId } = withGoal();
    const c = post(api, 'addContribution', { savingId, amount: 100, date: '2026-08-01' });
    expect(post(api, 'deleteContribution', { id: c.data.id })).toEqual({ success: true });
    expect(get(api, 'list').data.savingContributions).toEqual([]);
  });

  it('reports not found for a goal that does not exist', () => {
    const { api } = withGoal();
    expect(post(api, 'deleteSaving', { id: 'nope' }).success).toBe(false);
    expect(post(api, 'updateSaving', { id: 'nope', name: 'x' }).success).toBe(false);
  });
});

describe('allocations', () => {
  const ALLOCATION_HEADERS = [
    'id', 'name', 'icon', 'amount', 'cadence', 'intervalDays',
    'categories', 'startDate', 'openingBalance', 'note', 'createdAt'
  ];

  const base = {
    name: 'Food',
    icon: '🍜',
    amount: 50000,
    cadence: 'daily',
    intervalDays: 1,
    categories: ['Food', 'Groceries'],
    startDate: '2026-08-01',
    openingBalance: 0,
    note: ''
  };

  it('creates the tab with headers on first write', () => {
    const { api, sheets } = loadCode();
    post(api, 'addAllocation', base);
    expect(sheets.get('Allocations')!.rows[0]).toEqual(ALLOCATION_HEADERS);
  });

  it('returns the created row', () => {
    const { api } = loadCode();
    const res = post(api, 'addAllocation', base);
    expect(res.success).toBe(true);
    expect(res.data.name).toBe('Food');
    expect(res.data.amount).toBe(50000);
    expect(res.data.categories).toEqual(['Food', 'Groceries']);
  });

  it('lists allocations', () => {
    const { api } = loadCode();
    post(api, 'addAllocation', base);
    const listed = get(api, 'list');
    expect(listed.data.allocations).toHaveLength(1);
    expect(listed.data.allocations[0].categories).toEqual(['Food', 'Groceries']);
  });

  it('does not create the tab merely by listing', () => {
    const { api, sheets } = loadCode();
    get(api, 'list');
    expect(sheets.has('Allocations')).toBe(false);
  });

  it('updates only the fields sent', () => {
    const { api } = loadCode();
    const created = post(api, 'addAllocation', base);
    const res = post(api, 'updateAllocation', { id: created.data.id, amount: 60000 });
    expect(res.success).toBe(true);
    expect(res.data.amount).toBe(60000);
    expect(res.data.name).toBe('Food');
    expect(res.data.categories).toEqual(['Food', 'Groceries']);
  });

  // A rebase on an overspent envelope writes a negative opening balance.
  it('stores a negative opening balance', () => {
    const { api } = loadCode();
    const created = post(api, 'addAllocation', base);
    const res = post(api, 'updateAllocation', {
      id: created.data.id,
      openingBalance: -200000,
      startDate: '2026-08-03'
    });
    expect(res.data.openingBalance).toBe(-200000);
    expect(res.data.startDate).toBe('2026-08-03');
  });

  it('reads a comma-separated categories cell written by hand', () => {
    const { api, sheets } = loadCode();
    post(api, 'addAllocation', base);
    const sheet = sheets.get('Allocations')!;
    sheet.rows[1][6] = 'Food, Transport';
    expect(get(api, 'list').data.allocations[0].categories).toEqual(['Food', 'Transport']);
  });

  it('deletes an allocation', () => {
    const { api } = loadCode();
    const created = post(api, 'addAllocation', base);
    expect(post(api, 'deleteAllocation', { id: created.data.id }).success).toBe(true);
    expect(get(api, 'list').data.allocations).toEqual([]);
  });

  it('reports a missing allocation rather than throwing', () => {
    const { api } = loadCode();
    post(api, 'addAllocation', base);
    expect(post(api, 'updateAllocation', { id: 'nope' }).success).toBe(false);
    expect(post(api, 'deleteAllocation', { id: 'nope' }).success).toBe(false);
  });
});
