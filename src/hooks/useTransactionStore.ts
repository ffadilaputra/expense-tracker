import { useCallback, useEffect, useRef, useState } from 'react';
import * as sheetApi from '../api/sheetApi';
import {
  isLocalId,
  loadCachedTransactions,
  loadQueue,
  makeLocalId,
  saveCachedTransactions,
  saveQueue
} from '../offline/localCache';
import useOnlineStatus from './useOnlineStatus';
import type { QueueEntry, Transaction, TransactionFormData } from '../types';

export interface TransactionStore {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  syncing: boolean;
  pendingCount: number;
  addTransaction: (form: TransactionFormData) => Promise<Transaction>;
  updateTransaction: (id: string, form: Partial<TransactionFormData>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

/**
 * Offline-first strategy (ported from recipe-app):
 * 1. First render reads transactions straight from localStorage (instant, no
 *    network).
 * 2. When online, refresh from the sheet in the background and merge — any
 *    change still in the sync queue takes precedence so it is never overwritten.
 * 3. add/update/delete apply to state and cache immediately (optimistic), then
 *    push to the sheet; on failure they stay queued and retry on reconnect.
 */
export default function useTransactionStore(): TransactionStore {
  const isOnline = useOnlineStatus();
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadCachedTransactions());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length);

  const syncLockRef = useRef(false);
  const txnsRef = useRef(transactions);
  txnsRef.current = transactions;

  const persist = useCallback((next: Transaction[]) => {
    setTransactions(next);
    saveCachedTransactions(next);
  }, []);

  const enqueue = useCallback((entry: QueueEntry) => {
    const queue = [...loadQueue(), entry];
    saveQueue(queue);
    setPendingCount(queue.length);
  }, []);

  const refreshFromRemote = useCallback(async () => {
    const remote = await sheetApi.fetchTransactions();
    const queue = loadQueue();
    const byId = new Map(remote.map((t) => [t.id, t]));

    for (const entry of queue) {
      if (entry.type === 'add' && entry.payload) {
        byId.set(entry.id, {
          ...(entry.payload as TransactionFormData),
          id: entry.id,
          createdAt: new Date().toISOString(),
          _pending: true
        });
      } else if (entry.type === 'update' && entry.payload) {
        const existing = byId.get(entry.id);
        if (existing) byId.set(entry.id, { ...existing, ...entry.payload, _pending: true });
      } else if (entry.type === 'delete') {
        byId.delete(entry.id);
      }
    }
    persist(Array.from(byId.values()));
  }, [persist]);

  const remapLocalId = useCallback(
    (oldId: string, created: Transaction) => {
      const next = txnsRef.current.map((t) => (t.id === oldId ? created : t));
      persist(next);
    },
    [persist]
  );

  const clearPendingFlag = useCallback(
    (id: string) => {
      persist(txnsRef.current.map((t) => (t.id === id ? { ...t, _pending: false } : t)));
    },
    [persist]
  );

  const syncQueue = useCallback(async () => {
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setSyncing(true);
    try {
      let queue = loadQueue();
      while (queue.length > 0) {
        const entry = queue[0];
        try {
          if (entry.type === 'add' && entry.payload) {
            const created = await sheetApi.addTransaction(entry.payload as TransactionFormData);
            remapLocalId(entry.id, created);
          } else if (entry.type === 'update' && entry.payload) {
            await sheetApi.updateTransaction({ id: entry.id, ...entry.payload });
            clearPendingFlag(entry.id);
          } else if (entry.type === 'delete') {
            if (!isLocalId(entry.id)) await sheetApi.deleteTransaction(entry.id);
          }
          const remaining = loadQueue().filter((e) => e !== entry);
          saveQueue(remaining);
          setPendingCount(remaining.length);
          queue = remaining;
        } catch {
          break; // still offline / server error — retry later
        }
      }
    } finally {
      setSyncing(false);
      syncLockRef.current = false;
    }
  }, [remapLocalId, clearPendingFlag]);

  useEffect(() => {
    setLoading(false);
    if (navigator.onLine) refreshFromRemote().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOnline) syncQueue().catch(() => {});
  }, [isOnline, syncQueue]);

  const addTransaction = useCallback(
    async (form: TransactionFormData): Promise<Transaction> => {
      const tempId = makeLocalId();
      const optimistic: Transaction = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persist([...txnsRef.current, optimistic]);
      enqueue({ type: 'add', id: tempId, payload: form });
      if (navigator.onLine) syncQueue().catch(() => {});
      return optimistic;
    },
    [persist, enqueue, syncQueue]
  );

  const updateTransaction = useCallback(
    async (id: string, form: Partial<TransactionFormData>): Promise<void> => {
      persist(txnsRef.current.map((t) => (t.id === id ? { ...t, ...form, _pending: true } : t)));

      const queue = loadQueue();
      const pendingAddIndex = queue.findIndex((e) => e.type === 'add' && e.id === id);
      if (pendingAddIndex !== -1) {
        // Mutate the queued add's payload IN PLACE rather than replacing the
        // entry object. syncQueue removes a processed entry by object identity
        // (e !== entry); replacing the object here would orphan an in-flight
        // add so it never gets removed and gets re-sent as a duplicate row.
        // Preserving identity keeps that removal correct.
        queue[pendingAddIndex].payload = { ...queue[pendingAddIndex].payload, ...form };
        saveQueue(queue);
        setPendingCount(queue.length);
      } else {
        enqueue({ type: 'update', id, payload: form });
      }
      if (navigator.onLine) syncQueue().catch(() => {});
    },
    [persist, enqueue, syncQueue]
  );

  const deleteTransaction = useCallback(
    async (id: string): Promise<void> => {
      persist(txnsRef.current.filter((t) => t.id !== id));
      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some((e) => e.type === 'add' && e.id === id);
      const filtered = queue.filter((e) => e.id !== id);
      if (!wasUnsyncedAdd) filtered.push({ type: 'delete', id, payload: null });
      saveQueue(filtered);
      setPendingCount(filtered.length);
      if (navigator.onLine) syncQueue().catch(() => {});
    },
    [persist, syncQueue]
  );

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
    loading,
    error,
    isOnline,
    syncing,
    pendingCount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    syncNow: syncAndRefresh,
    refresh: refreshFromRemote,
    clearError
  };
}
