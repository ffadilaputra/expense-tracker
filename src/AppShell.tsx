import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import useTransactionStore from './hooks/useTransactionStore';
import usePullToRefresh from './hooks/usePullToRefresh';
import PullToRefreshIndicator from './components/PullToRefreshIndicator';
import SyncStatus from './components/SyncStatus';
import LanguageSwitch from './components/LanguageSwitch';
import Summary from './components/Summary';
import SpendingHeatmap from './components/SpendingHeatmap';
import TransactionList from './components/TransactionList';
import { useToast } from './components/Toast';
import { useI18n } from './i18n/context';
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = todayISO();

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
        <Summary transactions={transactions} todayISO={today} />
        <SpendingHeatmap
          transactions={transactions}
          todayISO={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
        <TransactionList
          transactions={transactions}
          todayISO={today}
          selectedDate={selectedDate}
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
