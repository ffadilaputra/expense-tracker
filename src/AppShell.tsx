import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import useFinanceStore from './hooks/useFinanceStore';
import usePullToRefresh from './hooks/usePullToRefresh';
import PullToRefreshIndicator from './components/PullToRefreshIndicator';
import SyncStatus from './components/SyncStatus';
import LanguageSwitch from './components/LanguageSwitch';
import PeriodBar from './components/PeriodBar';
import Summary from './components/Summary';
import SpendingTrendMessage from './components/SpendingTrendMessage';
import SpendingChart from './components/SpendingChart';
import CategoryFilter from './components/CategoryFilter';
import TransactionList from './components/TransactionList';
import BackupPanel from './components/BackupPanel';
import BottomNav, { type Tab } from './components/BottomNav';
import AccountsScreen from './components/AccountsScreen';
import DebtsScreen from './components/DebtsScreen';
import SavingsScreen from './components/SavingsScreen';
import SavingsStrip from './components/SavingsStrip';
import LoadingSkeleton from './components/LoadingSkeleton';
import Icon from './components/Icon';
import { useToast } from './components/Toast';
import { useI18n } from './i18n/context';
import { computeBalance, computeTotals } from './utils/summary';
import { availableMonths, currentMonth, filterByPeriod, type Period } from './utils/period';
import { computeSpendingTrend } from './utils/spendingTrend';
import { summarizeAllDebts } from './utils/debt';
import {
  applyCategoryFilter,
  deriveCategories,
  sameChip,
  type CategoryChip
} from './utils/categoryFilter';
import type { TranslationKey } from './i18n/translations';
import type { Account, Debt, Saving, Transaction, TransactionFormData, Transfer } from './types';

const TransactionForm = lazy(() => import('./components/TransactionForm'));
const AccountForm = lazy(() => import('./components/AccountForm'));
const TransferForm = lazy(() => import('./components/TransferForm'));
const DebtForm = lazy(() => import('./components/DebtForm'));
const DebtDetail = lazy(() => import('./components/DebtDetail'));
const SavingForm = lazy(() => import('./components/SavingForm'));
const SavingDetail = lazy(() => import('./components/SavingDetail'));

interface AppShellProps {
  onChangeSheet: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** null = list view; 'new' = adding; a Transaction = editing that row. */
type Editor = null | 'new' | Transaction;

/** Same convention for the account modal. */
type AccountEditor = null | 'new' | Account;

/** Same again for debts. */
type DebtEditor = null | 'new' | Debt;

/** And for savings goals. */
type SavingEditor = null | 'new' | Saving;

export default function AppShell({ onChangeSheet }: AppShellProps) {
  const { t } = useI18n();
  const toast = useToast();
  const {
    transactions,
    accounts,
    transfers,
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
    debts,
    debtInstalments,
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
    syncNow,
    refresh,
    clearError
  } = useFinanceStore();

  const [editor, setEditor] = useState<Editor>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('transactions');
  const [accountEditor, setAccountEditor] = useState<AccountEditor>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [debtEditor, setDebtEditor] = useState<DebtEditor>(null);
  const [openDebtId, setOpenDebtId] = useState<string | null>(null);
  const [savingEditor, setSavingEditor] = useState<SavingEditor>(null);
  const [openSavingId, setOpenSavingId] = useState<string | null>(null);
  const today = todayISO();
  const [period, setPeriodState] = useState<Period>(() => currentMonth(today));
  const [category, setCategory] = useState<CategoryChip | null>(null);

  // One period drives Summary, the category chips, and the list, so there is
  // never more than one time filter in play.
  const periodScoped = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);
  const chips = useMemo(() => deriveCategories(periodScoped), [periodScoped]);
  const visible = useMemo(() => applyCategoryFilter(periodScoped, category), [periodScoped, category]);
  const totals = useMemo(() => computeTotals(periodScoped), [periodScoped]);
  const balance = useMemo(() => computeBalance(transactions), [transactions]);

  // Deliberately not period-scoped: this always compares this calendar month
  // with last, so it means the same thing wherever the user has navigated.
  const trend = useMemo(() => computeSpendingTrend(transactions, today), [transactions, today]);

  const months = useMemo(() => availableMonths(transactions, today), [transactions, today]);

  // Shared by the summary card and the debts screen so they cannot disagree.
  const debtSummary = useMemo(
    () => summarizeAllDebts(debts, debtInstalments, today),
    [debts, debtInstalments, today]
  );

  // Resolved once here so the list does not search the accounts array per row.
  const accountLabels = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.icon ? `${a.icon} ${a.name}` : a.name])),
    [accounts]
  );

  /**
   * Every period change goes through here: the new scope may no longer contain
   * the selected category, which would leave the list filtered by a chip that
   * is not on screen. Reconciling in one place keeps the period bar, the
   * heatmap, and the date input consistent, and does it synchronously rather
   * than in an effect that would render one frame of the broken state.
   */
  const setPeriod = useCallback(
    (next: Period) => {
      setPeriodState(next);
      setCategory((current) => {
        if (!current) return null;
        const stillThere = deriveCategories(filterByPeriod(transactions, next));
        return stillThere.some((c) => sameChip(c, current)) ? current : null;
      });
    },
    [transactions]
  );

  const emptyKey: TranslationKey = category
    ? 'emptyCategoryFiltered'
    : transactions.length === 0
      ? 'emptyTransactions'
      : period.kind === 'date'
        ? 'emptyDayFiltered'
        : 'emptyPeriodFiltered';

  // usePullToRefresh attaches its own window touch listeners internally (see
  // src/hooks/usePullToRefresh.ts) and just returns the current gesture
  // state - there is no `bind` object to spread onto a container, and
  // PullToRefreshIndicator takes that state as its props directly rather
  // than wrapped in a `pull` prop.
  const pull = usePullToRefresh(syncNow);

  const handleSubmit = useCallback(
    async (form: TransactionFormData) => {
      setSubmitting(true);
      try {
        if (editor && editor !== 'new') await updateTransaction(editor.id, form);
        else await addTransaction(form);
        setEditor(null);
      } finally {
        setSubmitting(false);
      }
    },
    [editor, addTransaction, updateTransaction]
  );

  const handleDelete = useCallback(async () => {
    if (!editor || editor === 'new') return;
    if (!confirm(t('deleteTransactionConfirm'))) return;
    setSubmitting(true);
    try {
      await deleteTransaction(editor.id);
      setEditor(null);
    } finally {
      setSubmitting(false);
    }
  }, [editor, deleteTransaction, t]);

  // Surface store errors as a toast from an effect, not during render:
  // toast.show() updates ToastProvider's state, and mutating another
  // component's state while rendering AppShell violates React's render-purity
  // rule (dev warning under StrictMode, fragile under concurrent rendering).
  useEffect(() => {
    if (error) {
      toast.show({ message: error, tone: 'error', sticky: true });
      clearError();
    }
  }, [error, toast, clearError]);

  const initialValue: TransactionFormData | undefined =
    editor && editor !== 'new'
      ? {
          type: editor.type,
          amount: editor.amount,
          category: editor.category,
          date: editor.date,
          note: editor.note ?? '',
          accountId: editor.accountId ?? ''
        }
      : undefined;

  const handleAccountSubmit = useCallback(
    async (form: { name: string; ownerName?: string; icon?: string }) => {
      setSubmitting(true);
      try {
        if (accountEditor && accountEditor !== 'new') await updateAccount(accountEditor.id, form);
        else await addAccount(form);
        setAccountEditor(null);
      } finally {
        setSubmitting(false);
      }
    },
    [accountEditor, addAccount, updateAccount]
  );

  const openDebt = debts.find((d) => d.id === openDebtId) ?? null;
  const openSaving = savings.find((x) => x.id === openSavingId) ?? null;

  const handleSavingSubmit = useCallback(
    async (form: Parameters<typeof addSaving>[0]) => {
      setSubmitting(true);
      try {
        if (savingEditor && savingEditor !== 'new') await updateSaving(savingEditor.id, form);
        else await addSaving(form);
        setSavingEditor(null);
      } finally {
        setSubmitting(false);
      }
    },
    [savingEditor, addSaving, updateSaving]
  );

  const handleSavingDelete = useCallback(async () => {
    if (!savingEditor || savingEditor === 'new') return;
    if (!confirm(t('savingDeleteConfirm'))) return;
    setSubmitting(true);
    try {
      await deleteSaving(savingEditor.id);
      setSavingEditor(null);
      setOpenSavingId(null);
    } finally {
      setSubmitting(false);
    }
  }, [savingEditor, deleteSaving, t]);

  const handleDebtSubmit = useCallback(
    async (form: Parameters<typeof addDebt>[0]) => {
      setSubmitting(true);
      try {
        if (debtEditor && debtEditor !== 'new') await updateDebt(debtEditor.id, form);
        else await addDebt(form);
        setDebtEditor(null);
      } finally {
        setSubmitting(false);
      }
    },
    [debtEditor, addDebt, updateDebt]
  );

  const handleDebtDelete = useCallback(async () => {
    if (!debtEditor || debtEditor === 'new') return;
    if (!confirm(t('debtDeleteConfirm'))) return;
    setSubmitting(true);
    try {
      await deleteDebt(debtEditor.id);
      setDebtEditor(null);
      setOpenDebtId(null);
    } finally {
      setSubmitting(false);
    }
  }, [debtEditor, deleteDebt, t]);

  const handleTransferSubmit = useCallback(
    async (form: Parameters<typeof addTransfer>[0]) => {
      setSubmitting(true);
      try {
        await addTransfer(form);
        setTransferOpen(false);
      } finally {
        setSubmitting(false);
      }
    },
    [addTransfer]
  );

  const handleTransferDelete = useCallback(
    async (transfer: Transfer) => {
      if (!confirm(t('transferDeleteConfirm'))) return;
      await deleteTransfer(transfer.id);
    },
    [deleteTransfer, t]
  );

  const handleAccountDelete = useCallback(async () => {
    if (!accountEditor || accountEditor === 'new') return;
    if (!confirm(t('accountDeleteConfirm'))) return;
    setSubmitting(true);
    try {
      await deleteAccount(accountEditor.id);
      setAccountEditor(null);
    } finally {
      setSubmitting(false);
    }
  }, [accountEditor, deleteAccount, t]);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-inner">
        <div className="app__header-row">
          <h1 className="app__title">{t('appTitle')}</h1>
          <div className="app__header-controls">
            <LanguageSwitch />
            <div className="app__menu">
              <button
                type="button"
                className="app__change-sheet"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={t('menuLabel')}
                aria-expanded={menuOpen}
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="app__menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="app__menu-list" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setBackupOpen(true);
                      }}
                    >
                      <Icon name="backup" />
                      {t('backupMenuItem')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onChangeSheet();
                      }}
                    >
                      <Icon name="sheet" />
                      {t('changeSheetLabel')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <SyncStatus
          isOnline={isOnline}
          syncing={syncing}
          pendingCount={pendingCount}
          refreshing={refreshing}
          failedCount={failedCount}
          onSyncNow={syncNow}
          onRetryFailed={retryFailedChanges}
          onDiscardFailed={discardFailedChanges}
        />
        </div>
      </header>

      <main className="app__main">
        <PullToRefreshIndicator {...pull} />
        {loading ? (
          <LoadingSkeleton />
        ) : tab === 'savings' ? (
          <SavingsScreen
            savings={savings}
            contributions={savingContributions}
            onAdd={() => setSavingEditor('new')}
            onOpen={(saving) => setOpenSavingId(saving.id)}
          />
        ) : tab === 'debts' ? (
          <DebtsScreen
            debts={debts}
            instalments={debtInstalments}
            todayISO={today}
            onAdd={() => setDebtEditor('new')}
            onOpen={(debt) => setOpenDebtId(debt.id)}
          />
        ) : tab === 'accounts' ? (
          <AccountsScreen
            accounts={accounts}
            transactions={transactions}
            transfers={transfers}
            onAdd={() => setAccountEditor('new')}
            onEdit={(account) => setAccountEditor(account)}
            onTransfer={() => setTransferOpen(true)}
            onDeleteTransfer={handleTransferDelete}
          />
        ) : (
          <>
        <PeriodBar period={period} todayISO={today} months={months} onChange={setPeriod} />
        <Summary
          balance={balance}
          income={totals.income}
          expense={totals.expense}
          period={period}
          todayISO={today}
          debt={debts.length > 0 ? debtSummary : null}
        />
        <SavingsStrip
          savings={savings}
          contributions={savingContributions}
          onOpen={(saving) => setOpenSavingId(saving.id)}
        />
        <SpendingTrendMessage trend={trend} />
        {/* The heatmap gets full history on purpose - its shading percentiles
            need the whole range, and it is the navigator for picking a date.
            The breakdown gets the period, since that is the question it
            answers. */}
        <SpendingChart
          transactions={transactions}
          periodTransactions={periodScoped}
          todayISO={today}
          selectedDate={period.kind === 'date' ? period.date : null}
          onSelectDate={(date) => setPeriod(date ? { kind: 'date', date } : currentMonth(today))}
        />
        <CategoryFilter chips={chips} selected={category} onSelect={setCategory} />
        <TransactionList
          transactions={visible}
          todayISO={today}
          emptyKey={emptyKey}
          accountLabels={accountLabels}
          onEdit={(txn) => setEditor(txn)}
        />
          </>
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} />

      {!loading && tab === 'transactions' && (
        <button type="button" className="fab" aria-label={t('addFabLabel')} onClick={() => setEditor('new')}>
          +
        </button>
      )}

      {backupOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('backupTitle')}>
          <div className="modal__backdrop" onClick={() => setBackupOpen(false)} />
          <div className="modal__panel">
            <h2 className="modal__title">{t('backupTitle')}</h2>
            <BackupPanel
              transactions={transactions}
              accounts={accounts}
              transfers={transfers}
              isOnline={isOnline}
              onClose={() => setBackupOpen(false)}
              onRestored={refresh}
            />
            <div className="form-actions">
              <button className="btn btn--secondary" type="button" onClick={() => setBackupOpen(false)}>
                {t('closeBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {openSaving && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={openSaving.name}>
          <div className="modal__backdrop" onClick={() => !submitting && setOpenSavingId(null)} />
          <div className="modal__panel modal__panel--wide">
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <SavingDetail
                saving={openSaving}
                contributions={savingContributions}
                todayISO={today}
                submitting={submitting}
                onAddContribution={async (amount, date, note) => {
                  setSubmitting(true);
                  try {
                    await addContribution({ savingId: openSaving.id, amount, date, note });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                onDeleteContribution={async (id) => {
                  setSubmitting(true);
                  try {
                    await deleteContribution(id);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                onEditSaving={() => setSavingEditor(openSaving)}
                onClose={() => setOpenSavingId(null)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {savingEditor !== null && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={savingEditor === 'new' ? t('savingAddTitle') : t('savingEditTitle')}
        >
          <div className="modal__backdrop" onClick={() => !submitting && setSavingEditor(null)} />
          <div className="modal__panel">
            <h2 className="modal__title">
              {savingEditor === 'new' ? t('savingAddTitle') : t('savingEditTitle')}
            </h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <SavingForm
                key={savingEditor === 'new' ? 'new' : savingEditor.id}
                onSubmit={handleSavingSubmit}
                submitting={submitting}
                initialValue={savingEditor === 'new' ? undefined : savingEditor}
                onCancel={() => setSavingEditor(null)}
                onDelete={savingEditor !== 'new' ? handleSavingDelete : undefined}
              />
            </Suspense>
          </div>
        </div>
      )}

      {openDebt && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={openDebt.name}>
          <div className="modal__backdrop" onClick={() => !submitting && setOpenDebtId(null)} />
          <div className="modal__panel modal__panel--wide">
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <DebtDetail
                debt={openDebt}
                instalments={debtInstalments}
                accounts={accounts}
                todayISO={today}
                submitting={submitting}
                onPay={async (row, accountId, date) => {
                  setSubmitting(true);
                  try {
                    await payInstalment({
                      debt: openDebt,
                      number: row.number,
                      amount: row.amount,
                      date,
                      accountId,
                      existing: debtInstalments.find(
                        (i) => i.debtId === openDebt.id && i.number === row.number
                      )
                    });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                onUnpay={async (row) => {
                  const stored = debtInstalments.find(
                    (i) => i.debtId === openDebt.id && i.number === row.number
                  );
                  if (!stored) return;
                  setSubmitting(true);
                  try {
                    await unpayInstalment(stored);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                onOverride={async (row, amount, dueDate) => {
                  const stored = debtInstalments.find(
                    (i) => i.debtId === openDebt.id && i.number === row.number
                  );
                  setSubmitting(true);
                  try {
                    await saveInstalment({
                      id: stored?.id ?? '',
                      debtId: openDebt.id,
                      number: row.number,
                      amount: amount > 0 ? amount : undefined,
                      dueDate: dueDate || undefined,
                      paidDate: stored?.paidDate,
                      transactionId: stored?.transactionId
                    });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                onEditDebt={() => setDebtEditor(openDebt)}
                onClose={() => setOpenDebtId(null)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {debtEditor !== null && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={debtEditor === 'new' ? t('debtAddTitle') : t('debtEditTitle')}
        >
          <div className="modal__backdrop" onClick={() => !submitting && setDebtEditor(null)} />
          <div className="modal__panel">
            <h2 className="modal__title">
              {debtEditor === 'new' ? t('debtAddTitle') : t('debtEditTitle')}
            </h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <DebtForm
                key={debtEditor === 'new' ? 'new' : debtEditor.id}
                onSubmit={handleDebtSubmit}
                submitting={submitting}
                initialValue={debtEditor === 'new' ? undefined : debtEditor}
                onCancel={() => setDebtEditor(null)}
                onDelete={debtEditor !== 'new' ? handleDebtDelete : undefined}
              />
            </Suspense>
          </div>
        </div>
      )}

      {transferOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('transferTitle')}>
          <div className="modal__backdrop" onClick={() => !submitting && setTransferOpen(false)} />
          <div className="modal__panel">
            <h2 className="modal__title">{t('transferTitle')}</h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <TransferForm
                accounts={accounts}
                onSubmit={handleTransferSubmit}
                submitting={submitting}
                onCancel={() => setTransferOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {accountEditor !== null && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={accountEditor === 'new' ? t('accountAddTitle') : t('accountEditTitle')}
        >
          <div className="modal__backdrop" onClick={() => !submitting && setAccountEditor(null)} />
          <div className="modal__panel">
            <h2 className="modal__title">
              {accountEditor === 'new' ? t('accountAddTitle') : t('accountEditTitle')}
            </h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <AccountForm
                key={accountEditor === 'new' ? 'new' : accountEditor.id}
                accounts={accounts}
                onSubmit={handleAccountSubmit}
                submitting={submitting}
                initialValue={accountEditor === 'new' ? undefined : accountEditor}
                onCancel={() => setAccountEditor(null)}
                onDelete={accountEditor !== 'new' ? handleAccountDelete : undefined}
              />
            </Suspense>
          </div>
        </div>
      )}

      {editor !== null && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={editor === 'new' ? t('addTitle') : t('editTitle')}>
          <div className="modal__backdrop" onClick={() => !submitting && setEditor(null)} />
          <div className="modal__panel">
            <h2 className="modal__title">{editor === 'new' ? t('addTitle') : t('editTitle')}</h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <TransactionForm
                key={editor === 'new' ? 'new' : editor.id}
                accounts={accounts}
                onSubmit={handleSubmit}
                submitting={submitting}
                initialValue={initialValue}
                onCancel={() => setEditor(null)}
                onDelete={editor !== 'new' ? handleDelete : undefined}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
