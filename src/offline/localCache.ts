// Local-first storage for the fetched collections - this is what lets the app
// open and be used with no internet connection at all. The pending-change
// queue lives in syncQueue.ts; this module only caches what has been read.

import { purge, readFromDisk, scheduleWrite } from './storage';
import { clearQueues } from './syncQueue';
import type { Account, Debt, DebtInstalment, Transaction, Transfer } from '../types';

const TRANSACTIONS_KEY = 'finance:transactions';
const ACCOUNTS_KEY = 'finance:accounts';
const TRANSFERS_KEY = 'finance:transfers';
const DEBTS_KEY = 'finance:debts';
const INSTALMENTS_KEY = 'finance:debt-instalments';

let transactionsCache: Transaction[] | null = null;
let accountsCache: Account[] | null = null;
let transfersCache: Transfer[] | null = null;
let debtsCache: Debt[] | null = null;
let instalmentsCache: DebtInstalment[] | null = null;

export function loadCachedTransactions(): Transaction[] {
  if (transactionsCache === null) transactionsCache = readFromDisk<Transaction[]>(TRANSACTIONS_KEY, []);
  return transactionsCache;
}

export function saveCachedTransactions(transactions: Transaction[]): void {
  transactionsCache = transactions;
  scheduleWrite(TRANSACTIONS_KEY, transactions);
}

export function loadCachedAccounts(): Account[] {
  if (accountsCache === null) accountsCache = readFromDisk<Account[]>(ACCOUNTS_KEY, []);
  return accountsCache;
}

export function saveCachedAccounts(accounts: Account[]): void {
  accountsCache = accounts;
  scheduleWrite(ACCOUNTS_KEY, accounts);
}

export function loadCachedTransfers(): Transfer[] {
  if (transfersCache === null) transfersCache = readFromDisk<Transfer[]>(TRANSFERS_KEY, []);
  return transfersCache;
}

export function saveCachedTransfers(transfers: Transfer[]): void {
  transfersCache = transfers;
  scheduleWrite(TRANSFERS_KEY, transfers);
}

export function loadCachedDebts(): Debt[] {
  if (debtsCache === null) debtsCache = readFromDisk<Debt[]>(DEBTS_KEY, []);
  return debtsCache;
}

export function saveCachedDebts(debts: Debt[]): void {
  debtsCache = debts;
  scheduleWrite(DEBTS_KEY, debts);
}

export function loadCachedInstalments(): DebtInstalment[] {
  if (instalmentsCache === null) {
    instalmentsCache = readFromDisk<DebtInstalment[]>(INSTALMENTS_KEY, []);
  }
  return instalmentsCache;
}

export function saveCachedInstalments(rows: DebtInstalment[]): void {
  instalmentsCache = rows;
  scheduleWrite(INSTALMENTS_KEY, rows);
}

export function makeLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isLocalId(id: string): boolean {
  return id.startsWith('local-');
}

/** Wipes every cached collection and the sync queue - used when switching sheets. */
export function clearCache(): void {
  transactionsCache = [];
  accountsCache = [];
  transfersCache = [];
  debtsCache = [];
  instalmentsCache = [];
  purge([TRANSACTIONS_KEY, ACCOUNTS_KEY, TRANSFERS_KEY, DEBTS_KEY, INSTALMENTS_KEY]);
  clearQueues();
}
