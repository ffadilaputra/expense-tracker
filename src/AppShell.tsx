import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import useTransactionStore from './hooks/useTransactionStore';
import usePullToRefresh from './hooks/usePullToRefresh';
import PullToRefreshIndicator from './components/PullToRefreshIndicator';
import SyncStatus from './components/SyncStatus';
import LanguageSwitch from './components/LanguageSwitch';
import PeriodBar from './components/PeriodBar';
import Summary from './components/Summary';
import SpendingTrendMessage from './components/SpendingTrendMessage';
import SpendingHeatmap from './components/SpendingHeatmap';
import CategoryFilter from './components/CategoryFilter';
import TransactionList from './components/TransactionList';
import { useToast } from './components/Toast';
import { useI18n } from './i18n/context';
import { computeBalance, computeTotals } from './utils/summary';
import { currentMonth, filterByPeriod, type Period } from './utils/period';
import { computeSpendingTrend } from './utils/spendingTrend';
import {
  applyCategoryFilter,
  deriveCategories,
  sameChip,
  type CategoryChip
} from './utils/categoryFilter';
import type { TranslationKey } from './i18n/translations';
import type { Transaction, TransactionFormData } from './types';

const TransactionForm = lazy(() => import('./components/TransactionForm'));

interface AppShellProps {
  onChangeSheet: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** null = list view; 'new' = adding; a Transaction = editing that row. */
type Editor = null | 'new' | Transaction;

export default function AppShell({ onChangeSheet }: AppShellProps) {
  const { t } = useI18n();
  const toast = useToast();
  const {
    transactions,
    error,
    isOnline,
    syncing,
    pendingCount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    syncNow,
    clearError
  } = useTransactionStore();

  const [editor, setEditor] = useState<Editor>(null);
  const [submitting, setSubmitting] = useState(false);
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
      ? { type: editor.type, amount: editor.amount, category: editor.category, date: editor.date, note: editor.note ?? '' }
      : undefined;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <h1 className="app__title">{t('appTitle')}</h1>
          <div className="app__header-controls">
            <LanguageSwitch />
            <button type="button" className="app__change-sheet" onClick={onChangeSheet} aria-label={t('changeSheetLabel')}>
              ⋯
            </button>
          </div>
        </div>
        <SyncStatus isOnline={isOnline} syncing={syncing} pendingCount={pendingCount} onSyncNow={syncNow} />
      </header>

      <main className="app__main">
        <PullToRefreshIndicator {...pull} />
        <PeriodBar period={period} todayISO={today} onChange={setPeriod} />
        <Summary
          balance={balance}
          income={totals.income}
          expense={totals.expense}
          period={period}
          todayISO={today}
        />
        <SpendingTrendMessage trend={trend} />
        {/* Full history on purpose: the shading percentiles need the whole
            range to mean anything, and this is the navigator for picking a
            date rather than a view of the current period. */}
        <SpendingHeatmap
          transactions={transactions}
          todayISO={today}
          selectedDate={period.kind === 'date' ? period.date : null}
          onSelectDate={(date) => setPeriod(date ? { kind: 'date', date } : currentMonth(today))}
        />
        <CategoryFilter chips={chips} selected={category} onSelect={setCategory} />
        <TransactionList
          transactions={visible}
          todayISO={today}
          emptyKey={emptyKey}
          onEdit={(txn) => setEditor(txn)}
        />
      </main>

      <button type="button" className="fab" aria-label={t('addFabLabel')} onClick={() => setEditor('new')}>
        +
      </button>

      {editor !== null && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={editor === 'new' ? t('addTitle') : t('editTitle')}>
          <div className="modal__backdrop" onClick={() => !submitting && setEditor(null)} />
          <div className="modal__panel">
            <h2 className="modal__title">{editor === 'new' ? t('addTitle') : t('editTitle')}</h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <TransactionForm
                key={editor === 'new' ? 'new' : editor.id}
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
