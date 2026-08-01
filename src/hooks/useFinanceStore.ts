import { useCallback, useEffect, useRef, useState } from 'react';
import * as sheetApi from '../api/sheetApi';
import {
  isLocalId,
  loadCachedAccounts,
  loadCachedDebts,
  loadCachedContributions,
  loadCachedInstalments,
  loadCachedSavings,
  loadCachedTransactions,
  loadCachedTransfers,
  makeLocalId,
  saveCachedAccounts,
  saveCachedDebts,
  saveCachedContributions,
  saveCachedInstalments,
  saveCachedSavings,
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
  Debt,
  DebtInstalment,
  QueueEntry,
  Saving,
  SavingContribution,
  Transaction,
  TransactionFormData,
  Transfer
} from '../types';

export interface FinanceStore {
  transactions: Transaction[];
  accounts: Account[];
  transfers: Transfer[];
  debts: Debt[];
  /** Sparse: only instalments that have been edited or paid. */
  debtInstalments: DebtInstalment[];
  savings: Saving[];
  savingContributions: SavingContribution[];
  /** First load with nothing cached to show yet. */
  loading: boolean;
  /** A fetch is in flight; cached data is already on screen. */
  refreshing: boolean;
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
  addDebt: (form: sheetApi.DebtFormData) => Promise<Debt>;
  updateDebt: (id: string, form: Partial<sheetApi.DebtFormData>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  saveInstalment: (row: sheetApi.InstalmentSaveData) => Promise<void>;
  payInstalment: (input: PayInstalmentInput) => Promise<void>;
  unpayInstalment: (row: DebtInstalment) => Promise<void>;
  addSaving: (form: sheetApi.SavingFormData) => Promise<Saving>;
  updateSaving: (id: string, form: Partial<sheetApi.SavingFormData>) => Promise<void>;
  deleteSaving: (id: string) => Promise<void>;
  addContribution: (form: Omit<sheetApi.ContributionFormData, 'id'>) => Promise<void>;
  deleteContribution: (id: string) => Promise<void>;
  retryFailedChanges: () => void;
  discardFailedChanges: () => void;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export interface PayInstalmentInput {
  debt: Debt;
  number: number;
  amount: number;
  date: string;
  accountId: string;
  /** The stored row for this instalment, when one already exists. */
  existing?: DebtInstalment;
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
  const [debts, setDebts] = useState<Debt[]>(() => loadCachedDebts());
  const [debtInstalments, setInstalments] = useState<DebtInstalment[]>(() => loadCachedInstalments());
  const [savings, setSavings] = useState<Saving[]>(() => loadCachedSavings());
  const [savingContributions, setContributions] = useState<SavingContribution[]>(
    () => loadCachedContributions()
  );
  // Offline-first: cached rows render instantly, so a full loading state is
  // only honest on a genuinely empty first load. Every other fetch is a
  // background refresh over content the user can already see and read.
  const [loading, setLoading] = useState(
    () => loadCachedTransactions().length === 0 && navigator.onLine
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length);
  const [failedCount, setFailedCount] = useState(() => loadFailed().length);

  const syncLockRef = useRef(false);
  const txnsRef = useRef(transactions);
  const accountsRef = useRef(accounts);
  const transfersRef = useRef(transfers);
  const debtsRef = useRef(debts);
  const instalmentsRef = useRef(debtInstalments);
  txnsRef.current = transactions;
  accountsRef.current = accounts;
  transfersRef.current = transfers;
  const savingsRef = useRef(savings);
  const contributionsRef = useRef(savingContributions);
  debtsRef.current = debts;
  instalmentsRef.current = debtInstalments;
  savingsRef.current = savings;
  contributionsRef.current = savingContributions;

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

  const persistDebts = useCallback((next: Debt[]) => {
    setDebts(next);
    saveCachedDebts(next);
  }, []);

  const persistInstalments = useCallback((next: DebtInstalment[]) => {
    setInstalments(next);
    saveCachedInstalments(next);
  }, []);

  const persistSavings = useCallback((next: Saving[]) => {
    setSavings(next);
    saveCachedSavings(next);
  }, []);

  const persistContributions = useCallback((next: SavingContribution[]) => {
    setContributions(next);
    saveCachedContributions(next);
  }, []);

  const syncCounts = useCallback(() => {
    setPendingCount(loadQueue().length);
    setFailedCount(loadFailed().length);
  }, []);

  const fetchAndMerge = useCallback(async () => {
    const remote = await sheetApi.fetchAll();
    const queue = loadQueue();

    const txnById = new Map(remote.transactions.map((t) => [t.id, t]));
    const accById = new Map(remote.accounts.map((a) => [a.id, a]));
    const trfById = new Map(remote.transfers.map((t) => [t.id, t]));
    const debtById = new Map(remote.debts.map((d) => [d.id, d]));
    const instById = new Map(remote.debtInstalments.map((i) => [i.id, i]));
    const savById = new Map(remote.savings.map((x) => [x.id, x]));
    const contById = new Map(remote.savingContributions.map((c) => [c.id, c]));

    const maps: Record<string, Map<string, { id: string }>> = {
      account: accById as never,
      transfer: trfById as never,
      debt: debtById as never,
      debtInstalment: instById as never,
      saving: savById as never,
      savingContribution: contById as never,
      transaction: txnById as never
    };

    for (const entry of queue) {
      const map = maps[entry.entity] ?? txnById;
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
    persistDebts([...debtById.values()]);
    persistInstalments([...instById.values()]);
    persistSavings([...savById.values()]);
    persistContributions([...contById.values()]);
  }, [
    persistTransactions,
    persistAccounts,
    persistTransfers,
    persistDebts,
    persistInstalments,
    persistSavings,
    persistContributions
  ]);

  /**
   * Wraps every fetch so the two indicators stay honest no matter which path
   * triggered it - mount, reconnect, pull-to-refresh, or a restore. Both clear
   * on failure too: a fetch that errored is finished, not still running.
   */
  const refreshFromRemote = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAndMerge();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [fetchAndMerge]);

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

      if (entry.entity === 'saving') {
        if (entry.type === 'add') {
          const created = await sheetApi.addSaving(entry.payload as sheetApi.SavingFormData);
          persistSavings(savingsRef.current.map((x) => (x.id === entry.id ? created : x)));
        } else if (entry.type === 'update') {
          await sheetApi.updateSaving({ id: entry.id, ...entry.payload });
          persistSavings(
            savingsRef.current.map((x) => (x.id === entry.id ? { ...x, _pending: false } : x))
          );
        } else if (!isLocalId(entry.id)) {
          await sheetApi.deleteSaving(entry.id);
        }
        return;
      }

      if (entry.entity === 'savingContribution') {
        if (entry.type === 'add') {
          const created = await sheetApi.addContribution(
            entry.payload as sheetApi.ContributionFormData
          );
          persistContributions(
            contributionsRef.current.map((c) => (c.id === entry.id ? created : c))
          );
        } else if (entry.type === 'delete' && !isLocalId(entry.id)) {
          await sheetApi.deleteContribution(entry.id);
        }
        return;
      }

      if (entry.entity === 'debt') {
        if (entry.type === 'add') {
          const created = await sheetApi.addDebt(entry.payload as sheetApi.DebtFormData);
          persistDebts(debtsRef.current.map((d) => (d.id === entry.id ? created : d)));
        } else if (entry.type === 'update') {
          await sheetApi.updateDebt({ id: entry.id, ...entry.payload });
          persistDebts(
            debtsRef.current.map((d) => (d.id === entry.id ? { ...d, _pending: false } : d))
          );
        } else if (!isLocalId(entry.id)) {
          await sheetApi.deleteDebt(entry.id);
        }
        return;
      }

      if (entry.entity === 'debtInstalment') {
        if (entry.type === 'delete') {
          if (!isLocalId(entry.id)) await sheetApi.deleteInstalment(entry.id);
          return;
        }
        // Always an upsert: the sheet keys on (debtId, number), so a second
        // save for the same instalment updates rather than duplicating.
        const saved = await sheetApi.saveInstalment(entry.payload as sheetApi.InstalmentSaveData);
        persistInstalments(
          instalmentsRef.current.map((i) => (i.id === entry.id ? saved : i))
        );
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
    [
      persistTransactions,
      persistAccounts,
      persistTransfers,
      persistDebts,
      persistInstalments,
      persistSavings,
      persistContributions
    ]
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
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }
    refreshFromRemote().catch((err: Error) => setError(err.message));
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

  const addDebt = useCallback(
    async (form: sheetApi.DebtFormData): Promise<Debt> => {
      const tempId = makeLocalId();
      const optimistic: Debt = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persistDebts([...debtsRef.current, optimistic]);
      queueChange({ entity: 'debt', type: 'add', id: tempId, payload: { ...form } });
      return optimistic;
    },
    [persistDebts, queueChange]
  );

  const updateDebt = useCallback(
    async (id: string, form: Partial<sheetApi.DebtFormData>): Promise<void> => {
      persistDebts(debtsRef.current.map((d) => (d.id === id ? { ...d, ...form, _pending: true } : d)));

      const queue = loadQueue();
      const pendingAdd = queue.find((e) => e.entity === 'debt' && e.type === 'add' && e.id === id);
      if (pendingAdd) {
        pendingAdd.payload = { ...pendingAdd.payload, ...form };
        saveQueue(queue);
        if (navigator.onLine) runSync();
        return;
      }
      queueChange({ entity: 'debt', type: 'update', id, payload: { ...form } });
    },
    [persistDebts, queueChange, runSync]
  );

  const deleteDebt = useCallback(
    async (id: string): Promise<void> => {
      persistDebts(debtsRef.current.filter((d) => d.id !== id));
      persistInstalments(instalmentsRef.current.filter((i) => i.debtId !== id));

      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some(
        (e) => e.entity === 'debt' && e.type === 'add' && e.id === id
      );
      const kept = queue.filter(
        (e) => !(e.entity === 'debt' && e.id === id) && !(e.entity === 'debtInstalment' && e.payload?.debtId === id)
      );
      if (!wasUnsyncedAdd) kept.push({ entity: 'debt', type: 'delete', id, payload: null });
      saveQueue(kept);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [persistDebts, persistInstalments, syncCounts, runSync]
  );

  /** Upsert of one instalment override row, keyed by (debtId, number). */
  const saveInstalment = useCallback(
    async (row: sheetApi.InstalmentSaveData): Promise<void> => {
      const existing = instalmentsRef.current.find(
        (i) => i.debtId === row.debtId && i.number === row.number
      );
      const id = existing?.id ?? row.id ?? makeLocalId();
      const next: DebtInstalment = {
        ...row,
        id,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        _pending: true
      };

      persistInstalments(
        existing
          ? instalmentsRef.current.map((i) => (i.id === id ? next : i))
          : [...instalmentsRef.current, next]
      );
      queueChange({
        entity: 'debtInstalment',
        type: existing ? 'update' : 'add',
        id,
        payload: { ...row, id }
      });
    },
    [persistInstalments, queueChange]
  );

  /**
   * Marking an instalment paid writes two things: the expense it actually was,
   * and the row recording that it happened.
   *
   * The transaction id is generated here and handed to the sheet rather than
   * letting the sheet mint one. Offline, a sheet-minted id would not exist yet,
   * so the instalment would point at a local id that gets replaced on sync and
   * unpaying could no longer find the expense to delete.
   */
  const payInstalment = useCallback(
    async ({ debt, number, amount, date, accountId, existing }: PayInstalmentInput): Promise<void> => {
      const transactionId = makeLocalId();
      const form: TransactionFormData = {
        type: 'expense',
        amount,
        category: debt.name,
        date,
        note: `Instalment ${number} of ${debt.instalmentCount}`,
        accountId
      };

      persistTransactions([
        ...txnsRef.current,
        { ...form, id: transactionId, createdAt: new Date().toISOString(), _pending: true }
      ]);
      queueChange({
        entity: 'transaction',
        type: 'add',
        id: transactionId,
        payload: { ...form, id: transactionId }
      });

      await saveInstalment({
        id: existing?.id ?? makeLocalId(),
        debtId: debt.id,
        number,
        amount: existing?.amount,
        dueDate: existing?.dueDate,
        paidDate: date,
        transactionId
      });
    },
    [persistTransactions, queueChange, saveInstalment]
  );

  const unpayInstalment = useCallback(
    async (row: DebtInstalment): Promise<void> => {
      if (row.transactionId) await deleteTransaction(row.transactionId);
      await saveInstalment({
        id: row.id,
        debtId: row.debtId,
        number: row.number,
        amount: row.amount,
        dueDate: row.dueDate,
        paidDate: undefined,
        transactionId: undefined
      });
    },
    [deleteTransaction, saveInstalment]
  );

  const addSaving = useCallback(
    async (form: sheetApi.SavingFormData): Promise<Saving> => {
      const tempId = makeLocalId();
      const optimistic: Saving = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persistSavings([...savingsRef.current, optimistic]);
      queueChange({ entity: 'saving', type: 'add', id: tempId, payload: { ...form } });
      return optimistic;
    },
    [persistSavings, queueChange]
  );

  const updateSaving = useCallback(
    async (id: string, form: Partial<sheetApi.SavingFormData>): Promise<void> => {
      persistSavings(
        savingsRef.current.map((x) => (x.id === id ? { ...x, ...form, _pending: true } : x))
      );

      const queue = loadQueue();
      const pendingAdd = queue.find((e) => e.entity === 'saving' && e.type === 'add' && e.id === id);
      if (pendingAdd) {
        pendingAdd.payload = { ...pendingAdd.payload, ...form };
        saveQueue(queue);
        if (navigator.onLine) runSync();
        return;
      }
      queueChange({ entity: 'saving', type: 'update', id, payload: { ...form } });
    },
    [persistSavings, queueChange, runSync]
  );

  /** Contributions go with the goal: they are earmarks nothing else references. */
  const deleteSaving = useCallback(
    async (id: string): Promise<void> => {
      persistSavings(savingsRef.current.filter((x) => x.id !== id));
      persistContributions(contributionsRef.current.filter((c) => c.savingId !== id));

      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some(
        (e) => e.entity === 'saving' && e.type === 'add' && e.id === id
      );
      const kept = queue.filter(
        (e) =>
          !(e.entity === 'saving' && e.id === id) &&
          !(e.entity === 'savingContribution' && e.payload?.savingId === id)
      );
      if (!wasUnsyncedAdd) kept.push({ entity: 'saving', type: 'delete', id, payload: null });
      saveQueue(kept);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [persistSavings, persistContributions, syncCounts, runSync]
  );

  const addContribution = useCallback(
    async (form: Omit<sheetApi.ContributionFormData, 'id'>): Promise<void> => {
      const tempId = makeLocalId();
      persistContributions([
        ...contributionsRef.current,
        { ...form, id: tempId, createdAt: new Date().toISOString(), _pending: true }
      ]);
      queueChange({
        entity: 'savingContribution',
        type: 'add',
        id: tempId,
        payload: { ...form, id: tempId }
      });
    },
    [persistContributions, queueChange]
  );

  const deleteContribution = useCallback(
    async (id: string): Promise<void> => {
      persistContributions(contributionsRef.current.filter((c) => c.id !== id));

      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some(
        (e) => e.entity === 'savingContribution' && e.type === 'add' && e.id === id
      );
      const kept = queue.filter((e) => !(e.entity === 'savingContribution' && e.id === id));
      if (!wasUnsyncedAdd) {
        kept.push({ entity: 'savingContribution', type: 'delete', id, payload: null });
      }
      saveQueue(kept);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [persistContributions, syncCounts, runSync]
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
    debts,
    debtInstalments,
    loading,
    refreshing,
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
    addDebt,
    updateDebt,
    deleteDebt,
    saveInstalment,
    payInstalment,
    unpayInstalment,
    savings,
    savingContributions,
    addSaving,
    updateSaving,
    deleteSaving,
    addContribution,
    deleteContribution,
    retryFailedChanges,
    discardFailedChanges,
    syncNow: syncAndRefresh,
    refresh: refreshFromRemote,
    clearError
  };
}
