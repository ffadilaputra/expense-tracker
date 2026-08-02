import type { Account, Transaction, Transfer } from '../../types';

/**
 * Stand-in owner for accounts saved without one. The leading space cannot
 * survive the trim in `ownerOf`, so it can never collide with a real name -
 * the same trick `UNCATEGORIZED` uses in categoryFilter.ts.
 */
export const NO_OWNER = ' no-owner';

export interface AccountBalance {
  account: Account;
  balance: number;
}

export interface OwnerGroup {
  /** A real owner name, or NO_OWNER. The display layer translates the latter. */
  owner: string;
  accounts: AccountBalance[];
  subtotal: number;
}

function ownerOf(account: Account): string {
  const trimmed = (account.ownerName ?? '').trim();
  return trimmed === '' ? NO_OWNER : trimmed;
}

/**
 * What is in this account: what was earned into it minus what was spent from
 * it, plus what was transferred in minus what was transferred out.
 *
 * There is no opening balance, so this reflects only what has been logged - an
 * account that already held money before the app was used reads low.
 */
export function computeAccountBalance(
  accountId: string,
  transactions: Transaction[],
  transfers: Transfer[]
): number {
  let balance = 0;

  for (const t of transactions) {
    if (t.accountId !== accountId) continue;
    balance += t.type === 'income' ? t.amount : -t.amount;
  }

  for (const t of transfers) {
    // A transfer to itself moves nothing; netting it would be a no-op anyway,
    // but skipping keeps that explicit rather than accidental.
    if (t.fromAccountId === t.toAccountId) continue;
    if (t.toAccountId === accountId) balance += t.amount;
    if (t.fromAccountId === accountId) balance -= t.amount;
  }

  return balance;
}

/** Transactions never assigned to an account. Transfers always have both ends. */
export function computeUnassignedBalance(transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => {
    if (t.accountId) return sum;
    return sum + (t.type === 'income' ? t.amount : -t.amount);
  }, 0);
}

/**
 * Accounts grouped under their owner, each group carrying its own subtotal.
 * Owners sort alphabetically and accounts alphabetically within a group;
 * the ownerless group sorts last so it never displaces a real one.
 */
export function groupAccountsByOwner(
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[]
): OwnerGroup[] {
  const byOwner = new Map<string, AccountBalance[]>();

  for (const account of accounts) {
    const owner = ownerOf(account);
    const entry = { account, balance: computeAccountBalance(account.id, transactions, transfers) };
    const existing = byOwner.get(owner);
    if (existing) existing.push(entry);
    else byOwner.set(owner, [entry]);
  }

  return [...byOwner.entries()]
    .map(([owner, entries]) => ({
      owner,
      accounts: entries.sort((a, b) => a.account.name.localeCompare(b.account.name)),
      subtotal: entries.reduce((sum, e) => sum + e.balance, 0)
    }))
    .sort((a, b) => {
      if (a.owner === NO_OWNER) return 1;
      if (b.owner === NO_OWNER) return -1;
      return a.owner.localeCompare(b.owner);
    });
}

/**
 * Every account plus the unassigned bucket. Transfers net to zero across the
 * two accounts they touch, so this equals the all-time balance.
 */
export function totalAcrossAccounts(
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[]
): number {
  const inAccounts = accounts.reduce(
    (sum, a) => sum + computeAccountBalance(a.id, transactions, transfers),
    0
  );
  return inAccounts + computeUnassignedBalance(transactions);
}
