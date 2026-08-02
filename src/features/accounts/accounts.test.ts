import { describe, it, expect } from 'vitest';
import {
  NO_OWNER,
  computeAccountBalance,
  computeUnassignedBalance,
  groupAccountsByOwner,
  totalAcrossAccounts
} from './accounts';
import type { Account, Transaction, Transfer } from '../../types';

function acc(partial: Partial<Account> & { id: string }): Account {
  return { name: partial.id, createdAt: '2026-08-01T00:00:00.000Z', ...partial };
}

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36), type: 'expense', amount: 0, category: '',
    date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', ...partial
  };
}

function trf(partial: Partial<Transfer> & { fromAccountId: string; toAccountId: string }): Transfer {
  return {
    id: Math.random().toString(36), amount: 0, date: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z', ...partial
  };
}

describe('computeAccountBalance', () => {
  it('is income minus expense for that account only', () => {
    const txns = [
      tx({ accountId: 'a', type: 'income', amount: 900000 }),
      tx({ accountId: 'a', type: 'expense', amount: 250000 }),
      tx({ accountId: 'b', type: 'expense', amount: 999999 })
    ];
    expect(computeAccountBalance('a', txns, [])).toBe(650000);
  });

  it('adds transfers in and subtracts transfers out', () => {
    const transfers = [
      trf({ fromAccountId: 'a', toAccountId: 'b', amount: 500000 }),
      trf({ fromAccountId: 'c', toAccountId: 'a', amount: 200000 })
    ];
    expect(computeAccountBalance('a', [], transfers)).toBe(-300000);
    expect(computeAccountBalance('b', [], transfers)).toBe(500000);
  });

  it('nets a transfer to zero across both ends', () => {
    const transfers = [trf({ fromAccountId: 'a', toAccountId: 'b', amount: 500000 })];
    const a = computeAccountBalance('a', [], transfers);
    const b = computeAccountBalance('b', [], transfers);
    expect(a + b).toBe(0);
  });

  it('ignores a transfer where both ends are the same account', () => {
    const transfers = [trf({ fromAccountId: 'a', toAccountId: 'a', amount: 500000 })];
    expect(computeAccountBalance('a', [], transfers)).toBe(0);
  });

  it('is zero for an account with no activity', () => {
    expect(computeAccountBalance('a', [], [])).toBe(0);
  });

  it('never counts unassigned transactions toward an account', () => {
    expect(computeAccountBalance('a', [tx({ type: 'income', amount: 5 })], [])).toBe(0);
  });
});

describe('computeUnassignedBalance', () => {
  it('covers transactions with no account, blank or absent', () => {
    const txns = [
      tx({ type: 'income', amount: 1000 }),
      tx({ accountId: '', type: 'expense', amount: 250 }),
      tx({ accountId: 'a', type: 'expense', amount: 999999 })
    ];
    expect(computeUnassignedBalance(txns)).toBe(750);
  });

  it('is zero when every transaction has an account', () => {
    expect(computeUnassignedBalance([tx({ accountId: 'a', type: 'income', amount: 5 })])).toBe(0);
  });
});

describe('groupAccountsByOwner', () => {
  const accounts = [
    acc({ id: 'bca', name: 'BCA', ownerName: 'Budi' }),
    acc({ id: 'cash', name: 'Cash', ownerName: 'Budi' }),
    acc({ id: 'gopay', name: 'GoPay', ownerName: 'Sari' }),
    acc({ id: 'jenius', name: 'Jenius' })
  ];
  const txns = [
    tx({ accountId: 'bca', type: 'income', amount: 8200000 }),
    tx({ accountId: 'cash', type: 'income', amount: 450000 }),
    tx({ accountId: 'gopay', type: 'income', amount: 125000 }),
    tx({ accountId: 'jenius', type: 'income', amount: 300000 })
  ];

  it('groups accounts under their owner with a subtotal', () => {
    const groups = groupAccountsByOwner(accounts, txns, []);
    expect(groups[0].owner).toBe('Budi');
    expect(groups[0].subtotal).toBe(8650000);
    expect(groups[0].accounts.map((a) => a.account.name)).toEqual(['BCA', 'Cash']);
  });

  it('sorts owners alphabetically', () => {
    const groups = groupAccountsByOwner(accounts, txns, []);
    expect(groups.map((g) => g.owner)).toEqual(['Budi', 'Sari', NO_OWNER]);
  });

  it('puts accounts with no owner in their own group, sorted last', () => {
    const groups = groupAccountsByOwner(accounts, txns, []);
    const last = groups[groups.length - 1];
    expect(last.owner).toBe(NO_OWNER);
    expect(last.accounts.map((a) => a.account.name)).toEqual(['Jenius']);
  });

  it('treats a whitespace-only owner as no owner', () => {
    const groups = groupAccountsByOwner([acc({ id: 'x', ownerName: '   ' })], [], []);
    expect(groups[0].owner).toBe(NO_OWNER);
  });

  it('sorts accounts alphabetically within a group', () => {
    const unsorted = [
      acc({ id: 'z', name: 'Zebra', ownerName: 'Budi' }),
      acc({ id: 'a', name: 'Alpha', ownerName: 'Budi' })
    ];
    const groups = groupAccountsByOwner(unsorted, [], []);
    expect(groups[0].accounts.map((a) => a.account.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('includes an account with no transactions at a zero balance', () => {
    const groups = groupAccountsByOwner([acc({ id: 'new', name: 'New', ownerName: 'Budi' })], [], []);
    expect(groups[0].accounts[0].balance).toBe(0);
    expect(groups[0].subtotal).toBe(0);
  });

  it('returns nothing when there are no accounts', () => {
    expect(groupAccountsByOwner([], txns, [])).toEqual([]);
  });
});

describe('totalAcrossAccounts', () => {
  it('adds every account balance and the unassigned bucket', () => {
    const accounts = [acc({ id: 'a' }), acc({ id: 'b' })];
    const txns = [
      tx({ accountId: 'a', type: 'income', amount: 1000 }),
      tx({ accountId: 'b', type: 'income', amount: 2000 }),
      tx({ type: 'income', amount: 500 })
    ];
    expect(totalAcrossAccounts(accounts, txns, [])).toBe(3500);
  });

  it('equals the all-time balance, since transfers net out', () => {
    const accounts = [acc({ id: 'a' }), acc({ id: 'b' })];
    const txns = [
      tx({ accountId: 'a', type: 'income', amount: 5000 }),
      tx({ accountId: 'b', type: 'expense', amount: 1200 })
    ];
    const transfers = [trf({ fromAccountId: 'a', toAccountId: 'b', amount: 900 })];
    expect(totalAcrossAccounts(accounts, txns, transfers)).toBe(3800);
  });

  it('is zero with nothing at all', () => {
    expect(totalAcrossAccounts([], [], [])).toBe(0);
  });
});
