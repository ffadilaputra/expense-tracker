import { useCallback, useEffect, useRef, useState } from 'react';
import * as sheetApi from '../api/sheetApi';
import {
  isLocalId,
  loadCachedAccounts,
  loadCachedTransactions,
  loadCachedTransfers,
  makeLocalId,
  saveCachedAccounts,
  saveCachedTransactions,
  saveCachedTransfers
} from '../offline/localCache';
import {
  discardFailed,
  drainQueue,
  enqueue,
  loadFailed,
  loadQueue,
  retryFailed,
  saveQueue
} from '../offline/syncQueue';
import useOnlineStatus from './useOnlineStatus';
import { getStoredLocale } from '../i18n/locale';
import { translate } from '../i18n/translate';
import type {
  Account,
  QueueEntry,
  Transaction,
  TransactionFormData,
  Transfer
} from '../types';

export interface FinanceStore {
  transactions: Transaction[];
  accounts: Account[];
  transfers: Transfer[];
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  addTransaction: (form: TransactionFormData) => Promise<Transaction>;
  updateTransaction: (id: string, form: Partial<TransactionFormData>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addAccount: (form: sheetApi.AccountFormData) => Promise<Account>;
  updateAccount: (id: string, form: Partial<sheetApi.AccountFormData>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  addTransfer: (form: sheetApi.TransferFormData) => Promise<Transfer>;
  deleteTransfer: (id: string) => Promise<void>;
  retryFailedChanges: () => void;
  discardFailedChanges: () => void;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const isRejection = (err: unknown) => err instanceof sheetApi.ApiRejectionError;

/**
 * Offline-first store for every collection the sheet holds.
 *
 * One hook rather than one per entity on purpose: they share a single fetch, a
 * single queue and a single drain lock. Separate hooks would each own a lock
 * and could drain the same queue concurrently.
 *
 * 1. First render reads straight from localStorage - instant, no network.
 * 2. When online, refresh from the sheet and merge; anything still queued wins
 *    so a local change is never overwritten by a stale read.
 * 3. Mutations apply locally first, then push; on failure they stay queued.
 */
export default function useFinanceStore(): FinanceStore {
  const isOnline = useOnlineStatus();
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadCachedTransactions());
  const [accounts, setAccounts] = useState<Account[]>(() => loadCachedAccounts());
  const [transfers, setTransfers] = useState<Transfer[]>(() => loadCachedTransfers());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length);
  const [failedCount, setFailedCount] = useState(() => loadFailed().length);

  const syncLockRef = useRef(false);
  const txnsRef = useRef(transactions);
  const accountsRef = useRef(accounts);
  const transfersRef = useRef(transfers);
  txnsRef.current = transactions;
  accountsRef.current = accounts;
  transfersRef.current = transfers;

  const persistTransactions = useCallback((next: Transaction[]) => {
    setTransactions(next);
    saveCachedTransactions(next);
  }, []);

  const persistAccounts = useCallback((next: Account[]) => {
    setAccounts(next);
    saveCachedAccounts(next);
  }, []);

  const persistTransfers = useCallback((next: Transfer[]) => {
    setTransfers(next);
    saveCachedTransfers(next);
  }, []);

  const syncCounts = useCallback(() => {
    setPendingCount(loadQueue().length);
    setFailedCount(loadFailed().length);
  }, []);

  const refreshFromRemote = useCallback(async () => {
    const remote = await sheetApi.fetchAll();
    const queue = loadQueue();

    const txnById = new Map(remote.transactions.map((t) => [t.id, t]));
    const accById = new Map(remote.accounts.map((a) => [a.id, a]));
    const trfById = new Map(remote.transfers.map((t) => [t.id, t]));

    for (const entry of queue) {
      const map =
        entry.entity === 'account' ? accById : entry.entity === 'transfer' ? trfById : txnById;
      if (entry.type === 'delete') {
        map.delete(entry.id);
        continue;
      }
      if (!entry.payload) continue;
      if (entry.type === 'add') {
        map.set(entry.id, {
          ...(entry.payload as object),
          id: entry.id,
          createdAt: new Date().toISOString(),
          _pending: true
        } as never);
      } else {
        const existing = map.get(entry.id);
        if (existing) map.set(entry.id, { ...existing, ...entry.payload, _pending: true } as never);
      }
    }

    persistTransactions([...txnById.values()]);
    persistAccounts([...accById.values()]);
    persistTransfers([...trfById.values()]);
  }, [persistTransactions, persistAccounts, persistTransfers]);

  /**
   * Routes one queued change to the API. Delete of a row that never reached the
   * sheet (still carrying a local id) is a no-op remotely - there is nothing
   * there to remove.
   */
  const dispatch = useCallback(
    async (entry: QueueEntry) => {
      if (entry.entity === 'account') {
        if (entry.type === 'add') {
          const created = await sheetApi.addAccount(entry.payload as sheetApi.AccountFormData);
          persistAccounts(accountsRef.current.map((a) => (a.id === entry.id ? created : a)));
        } else if (entry.type === 'update') {
          await sheetApi.updateAccount({ id: entry.id, ...entry.payload });
          persistAccounts(
            accountsRef.current.map((a) => (a.id === entry.id ? { ...a, _pending: false } : a))
          );
        } else if (!isLocalId(entry.id)) {
          await sheetApi.deleteAccount(entry.id);
        }
        return;
      }

      if (entry.entity === 'transfer') {
        if (entry.type === 'add') {
          const created = await sheetApi.addTransfer(entry.payload as sheetApi.TransferFormData);
          persistTransfers(transfersRef.current.map((t) => (t.id === entry.id ? created : t)));
        } else if (entry.type === 'delete' && !isLocalId(entry.id)) {
          await sheetApi.deleteTransfer(entry.id);
        }
        return;
      }

      if (entry.type === 'add') {
        const created = await sheetApi.addTransaction(entry.payload as TransactionFormData);
        persistTransactions(txnsRef.current.map((t) => (t.id === entry.id ? created : t)));
      } else if (entry.type === 'update') {
        await sheetApi.updateTransaction({ id: entry.id, ...entry.payload });
        persistTransactions(
          txnsRef.current.map((t) => (t.id === entry.id ? { ...t, _pending: false } : t))
        );
      } else if (!isLocalId(entry.id)) {
        await sheetApi.deleteTransaction(entry.id);
      }
    },
    [persistTransactions, persistAccounts, persistTransfers]
  );

  const syncQueue = useCallback(async () => {
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setSyncing(true);
    try {
      const result = await drainQueue(dispatch, isRejection);
      syncCounts();

      // A refusal repeats on every retry, so it is reported with the sheet's
      // own reason; the entry is now in the dead-letter list rather than
      // blocking everything behind it. A transport failure while offline is the
      // normal path for an offline-first app and stays silent - the pending
      // count already shows it.
      if (result.deadLettered.length > 0) {
        setError(
          translate(getStoredLocale(), 'errSyncRejected', { reason: result.deadLettered[0].reason })
        );
      } else if (result.transportError && navigator.onLine) {
        setError(translate(getStoredLocale(), 'errSyncFailed'));
      }
    } finally {
      setSyncing(false);
      syncLockRef.current = false;
    }
  }, [dispatch, syncCounts]);

  const runSync = useCallback(() => {
    syncQueue().catch((err: Error) => setError(err.message));
  }, [syncQueue]);

  useEffect(() => {
    setLoading(false);
    if (navigator.onLine) refreshFromRemote().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOnline) runSync();
  }, [isOnline, runSync]);

  const queueChange = useCallback(
    (entry: QueueEntry) => {
      enqueue(entry);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [syncCounts, runSync]
  );

  const addTransaction = useCallback(
    async (form: TransactionFormData): Promise<Transaction> => {
      const tempId = makeLocalId();
      const optimistic: Transaction = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persistTransactions([...txnsRef.current, optimistic]);
      queueChange({ entity: 'transaction', type: 'add', id: tempId, payload: { ...form } });
      return optimistic;
    },
    [persistTransactions, queueChange]
  );

  const updateTransaction = useCallback(
    async (id: string, form: Partial<TransactionFormData>): Promise<void> => {
      persistTransactions(
        txnsRef.current.map((t) => (t.id === id ? { ...t, ...form, _pending: true } : t))
      );

      const queue = loadQueue();
      const pendingAdd = queue.find(
        (e) => e.entity === 'transaction' && e.type === 'add' && e.id === id
      );
      if (pendingAdd) {
        // Mutate the queued add's payload in place rather than replacing the
        // entry object: drainQueue removes a processed entry by identity, so
        // swapping the object would orphan an in-flight add and re-send it as a
        // duplicate row.
        pendingAdd.payload = { ...pendingAdd.payload, ...form };
        saveQueue(queue);
        if (navigator.onLine) runSync();
        return;
      }
      queueChange({ entity: 'transaction', type: 'update', id, payload: { ...form } });
    },
    [persistTransactions, queueChange, runSync]
  );

  const deleteTransaction = useCallback(
    async (id: string): Promise<void> => {
      persistTransactions(txnsRef.current.filter((t) => t.id !== id));

      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some(
        (e) => e.entity === 'transaction' && e.type === 'add' && e.id === id
      );
      const kept = queue.filter((e) => !(e.entity === 'transaction' && e.id === id));
      if (!wasUnsyncedAdd) kept.push({ entity: 'transaction', type: 'delete', id, payload: null });
      saveQueue(kept);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [persistTransactions, syncCounts, runSync]
  );

  const addAccount = useCallback(
    async (form: sheetApi.AccountFormData): Promise<Account> => {
      const tempId = makeLocalId();
      const optimistic: Account = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persistAccounts([...accountsRef.current, optimistic]);
      queueChange({ entity: 'account', type: 'add', id: tempId, payload: { ...form } });
      return optimistic;
    },
    [persistAccounts, queueChange]
  );

  const updateAccount = useCallback(
    async (id: string, form: Partial<sheetApi.AccountFormData>): Promise<void> => {
      persistAccounts(
        accountsRef.current.map((a) => (a.id === id ? { ...a, ...form, _pending: true } : a))
      );

      const queue = loadQueue();
      const pendingAdd = queue.find((e) => e.entity === 'account' && e.type === 'add' && e.id === id);
      if (pendingAdd) {
        pendingAdd.payload = { ...pendingAdd.payload, ...form };
        saveQueue(queue);
        if (navigator.onLine) runSync();
        return;
      }
      queueChange({ entity: 'account', type: 'update', id, payload: { ...form } });
    },
    [persistAccounts, queueChange, runSync]
  );

  const deleteAccount = useCallback(
    async (id: string): Promise<void> => {
      persistAccounts(accountsRef.current.filter((a) => a.id !== id));

      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some(
        (e) => e.entity === 'account' && e.type === 'add' && e.id === id
      );
      const kept = queue.filter((e) => !(e.entity === 'account' && e.id === id));
      if (!wasUnsyncedAdd) kept.push({ entity: 'account', type: 'delete', id, payload: null });
      saveQueue(kept);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [persistAccounts, syncCounts, runSync]
  );

  const addTransfer = useCallback(
    async (form: sheetApi.TransferFormData): Promise<Transfer> => {
      const tempId = makeLocalId();
      const optimistic: Transfer = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persistTransfers([...transfersRef.current, optimistic]);
      queueChange({ entity: 'transfer', type: 'add', id: tempId, payload: { ...form } });
      return optimistic;
    },
    [persistTransfers, queueChange]
  );

  const deleteTransfer = useCallback(
    async (id: string): Promise<void> => {
      persistTransfers(transfersRef.current.filter((t) => t.id !== id));

      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some(
        (e) => e.entity === 'transfer' && e.type === 'add' && e.id === id
      );
      const kept = queue.filter((e) => !(e.entity === 'transfer' && e.id === id));
      if (!wasUnsyncedAdd) kept.push({ entity: 'transfer', type: 'delete', id, payload: null });
      saveQueue(kept);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [persistTransfers, syncCounts, runSync]
  );

  const retryFailedChanges = useCallback(() => {
    retryFailed();
    syncCounts();
    if (navigator.onLine) runSync();
  }, [syncCounts, runSync]);

  const discardFailedChanges = useCallback(() => {
    discardFailed();
    syncCounts();
  }, [syncCounts]);

  const syncAndRefresh = useCallback(async () => {
    await syncQueue();
    if (!navigator.onLine) return;
    try {
      await refreshFromRemote();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [syncQueue, refreshFromRemote]);

  const clearError = useCallback(() => setError(null), []);

  return {
    transactions,
    accounts,
    transfers,
    loading,
    error,
    isOnline,
    syncing,
    pendingCount,
    failedCount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    updateAccount,
    deleteAccount,
    addTransfer,
    deleteTransfer,
    retryFailedChanges,
    discardFailedChanges,
    syncNow: syncAndRefresh,
    refresh: refreshFromRemote,
    clearError
  };
}
