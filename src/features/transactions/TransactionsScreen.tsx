import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import PeriodBar from './PeriodBar';
import ViewTabs from './ViewTabs';
import InsightsPanel from './InsightsPanel';
import Summary from './Summary';
import SpendingTrendMessage from './SpendingTrendMessage';
import SpendingChart from './SpendingChart';
import CategoryFilter from './CategoryFilter';
import TransactionList from './TransactionList';
import SavingsStrip from '../savings/SavingsStrip';
import AllocationsStrip from '../allocations/AllocationsStrip';
import {
  summarizeAllocations,
  unallocated as computeUnallocated
} from '../allocations/allocations';
import { pageSlice } from './pagination';
import { applyView, ALL_VIEW, ALL_VIEW_ID, type View } from './views';
import {
  loadViews,
  saveViews,
  loadInsightsOpen,
  saveInsightsOpen
} from '../../config/viewPrefs';
import { useI18n } from '../../i18n/context';
import { computeSpendingTrend } from './spendingTrend';
import { applyCategoryFilter, deriveCategories, sameChip, type CategoryChip } from './categoryChips';
import { computeBalance, computeTotals } from '../../utils/summary';
import { availableMonths, currentMonth, filterByPeriod, type Period } from '../../utils/period';
import type { AllDebtsSummary } from '../debts/debt';
import type { Allocation, Debt, Saving, SavingContribution, Transaction } from '../../types';
import type { TranslationKey } from '../../i18n/translations';

const ViewManager = lazy(() => import('./ViewManager'));

export interface TransactionsScreenProps {
  transactions: Transaction[];
  savings: Saving[];
  savingContributions: SavingContribution[];
  debts: Debt[];
  debtSummary: AllDebtsSummary;
  allocations: Allocation[];
  accountLabels: Map<string, string>;
  todayISO: string;
  onEditTransaction: (txn: Transaction) => void;
  onOpenSaving: (saving: Saving) => void;
  onOpenAllocation: (allocation: Allocation) => void;
  onAddAllocation: () => void;
}

export default function TransactionsScreen({
  transactions,
  savings,
  savingContributions,
  debts,
  debtSummary,
  allocations,
  accountLabels,
  todayISO,
  onEditTransaction,
  onOpenSaving,
  onOpenAllocation,
  onAddAllocation
}: TransactionsScreenProps) {
  const { t } = useI18n();
  const [period, setPeriodState] = useState<Period>(() => currentMonth(todayISO));
  const [category, setCategory] = useState<CategoryChip | null>(null);
  // Reset to one page whenever the scope changes - see setPeriod,
  // selectCategory and selectView below.
  const [pages, setPages] = useState(1);
  const [views, setViews] = useState<View[]>(() => loadViews());
  // Not persisted: a remembered filter that hides data is a footgun, and this
  // one would survive a restart with no obvious cause.
  const [activeViewId, setActiveViewId] = useState<string>(ALL_VIEW_ID);
  const [managerOpen, setManagerOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(() => loadInsightsOpen());

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? ALL_VIEW,
    [views, activeViewId]
  );

  // One period drives everything below it, and the view narrows that further,
  // so the screen reads period -> view -> chip -> page with no cross-talk.
  const periodScoped = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);
  const viewScoped = useMemo(() => applyView(periodScoped, activeView), [periodScoped, activeView]);
  const chips = useMemo(() => deriveCategories(viewScoped), [viewScoped]);
  const visible = useMemo(() => applyCategoryFilter(viewScoped, category), [viewScoped, category]);
  const page = useMemo(() => pageSlice(visible, pages), [visible, pages]);
  const totals = useMemo(() => computeTotals(viewScoped), [viewScoped]);
  // All-time and unscoped: it is the one figure on the screen the view must not
  // touch, since a balance narrowed to three categories is not a balance.
  const balance = useMemo(() => computeBalance(transactions), [transactions]);

  // Deliberately not period-scoped: this always compares this calendar month
  // with last, so it means the same thing wherever the user has navigated.
  // Null when there are no envelopes, so a user not using the feature sees the
  // Summary card exactly as it was.
  const unallocatedAmount = useMemo(() => {
    if (allocations.length === 0) return null;
    const rows = summarizeAllocations(allocations, transactions, todayISO);
    return computeUnallocated(balance, rows);
  }, [allocations, transactions, todayISO, balance]);

  // Scoped to the view like the totals it sits above: a global sentence over
  // view-scoped numbers would describe a different set of transactions. Still
  // reads full history, not the period - it compares this calendar month with
  // last, whatever period is displayed.
  const trend = useMemo(
    () => computeSpendingTrend(applyView(transactions, activeView), todayISO),
    [transactions, activeView, todayISO]
  );
  const months = useMemo(() => availableMonths(transactions, todayISO), [transactions, todayISO]);

  /**
   * Every period change goes through here: the new scope may no longer contain
   * the selected category, which would leave the list filtered by a chip that
   * is not on screen. Reconciling in one place keeps the period bar, the
   * heatmap, and the date input consistent, and does it synchronously rather
   * than in an effect that would render one frame of the broken state.
   */
  const setPeriod = useCallback(
    (next: Period) => {
      setPages(1);
      setPeriodState(next);
      setCategory((current) => {
        if (!current) return null;
        const stillThere = deriveCategories(filterByPeriod(transactions, next));
        return stillThere.some((c) => sameChip(c, current)) ? current : null;
      });
    },
    [transactions]
  );

  /**
   * Paired with setPeriod: both reset paging, synchronously rather than in an
   * effect, so the list never renders page 3 of a filter that just changed.
   */
  const selectCategory = useCallback((next: CategoryChip | null) => {
    setPages(1);
    setCategory(next);
  }, []);

  /**
   * Switching view clears the chip for the same reason changing period does:
   * the chip may not exist inside the new view. Synchronous rather than an
   * effect, so no frame renders the broken combination.
   */
  const selectView = useCallback((id: string) => {
    setPages(1);
    setCategory(null);
    setActiveViewId(id);
  }, []);

  /**
   * One writer for the array, so the persisted copy and the active tab can
   * never disagree - deleting the active view falls back to All in the same
   * step that saves.
   */
  const persistViews = useCallback((next: View[]) => {
    setViews(next);
    saveViews(next);
    setActiveViewId((current) =>
      current === ALL_VIEW_ID || next.some((v) => v.id === current) ? current : ALL_VIEW_ID
    );
  }, []);

  const toggleInsights = useCallback((open: boolean) => {
    setInsightsOpen(open);
    saveInsightsOpen(open);
  }, []);

  // The view case sits above the period cases because it is the more specific
  // reason the list is empty - telling someone "nothing this month" while they
  // look through a three-category view sends them to change the wrong control.
  const emptyKey: TranslationKey = category
    ? 'emptyCategoryFiltered'
    : transactions.length === 0
      ? 'emptyTransactions'
      : activeViewId !== ALL_VIEW_ID
        ? 'emptyViewFiltered'
        : period.kind === 'date'
          ? 'emptyDayFiltered'
          : 'emptyPeriodFiltered';

  return (
    <>
      <PeriodBar period={period} todayISO={todayISO} months={months} onChange={setPeriod} />
      <ViewTabs
        views={views}
        activeId={activeViewId}
        onSelect={selectView}
        onManage={() => setManagerOpen(true)}
      />
      <Summary
        balance={balance}
        income={totals.income}
        expense={totals.expense}
        period={period}
        todayISO={todayISO}
        debt={debts.length > 0 ? debtSummary : null}
        unallocated={unallocatedAmount}
      />
      {/* Outside the disclosure: it is the only way to create an envelope, and
          burying a feature's sole entry point would undo that decision. */}
      <AllocationsStrip
        allocations={allocations}
        transactions={transactions}
        todayISO={todayISO}
        onOpen={onOpenAllocation}
        onAdd={onAddAllocation}
      />

      <InsightsPanel open={insightsOpen} onToggle={toggleInsights}>
        <SavingsStrip savings={savings} contributions={savingContributions} onOpen={onOpenSaving} />
        <SpendingTrendMessage trend={trend} />
        {/* The heatmap keeps full history - its shading percentiles need the
            whole range. The breakdown gets the view-scoped period, since that
            is the question it answers. */}
        <SpendingChart
          transactions={transactions}
          periodTransactions={viewScoped}
          todayISO={todayISO}
          selectedDate={period.kind === 'date' ? period.date : null}
          onSelectDate={(date) => setPeriod(date ? { kind: 'date', date } : currentMonth(todayISO))}
        />
      </InsightsPanel>

      <CategoryFilter chips={chips} selected={category} onSelect={selectCategory} />
      <TransactionList
        transactions={page.rows}
        todayISO={todayISO}
        emptyKey={emptyKey}
        accountLabels={accountLabels}
        onEdit={onEditTransaction}
      />
      {page.hasMore && (
        <button
          type="button"
          className="txn-list__more"
          onClick={() => setPages((n) => n + 1)}
        >
          {t('loadMoreRemaining', { count: page.remaining })}
        </button>
      )}

      {managerOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('viewManageTitle')}>
          <div className="modal__backdrop" onClick={() => setManagerOpen(false)} />
          <div className="modal__panel">
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <ViewManager
                views={views}
                transactions={transactions}
                onSave={persistViews}
                onClose={() => setManagerOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}
