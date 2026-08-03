import { useCallback, useMemo, useState } from 'react';
import PeriodBar from './PeriodBar';
import Summary from './Summary';
import SpendingTrendMessage from './SpendingTrendMessage';
import SpendingChart from './SpendingChart';
import CategoryFilter from './CategoryFilter';
import TransactionList from './TransactionList';
import SavingsStrip from '../savings/SavingsStrip';
import AllocationsStrip from '../allocations/AllocationsStrip';
import { pageSlice } from './pagination';
import { useI18n } from '../../i18n/context';
import { computeSpendingTrend } from './spendingTrend';
import { applyCategoryFilter, deriveCategories, sameChip, type CategoryChip } from './categoryChips';
import { computeBalance, computeTotals } from '../../utils/summary';
import { availableMonths, currentMonth, filterByPeriod, type Period } from '../../utils/period';
import type { AllDebtsSummary } from '../debts/debt';
import type { Allocation, Debt, Saving, SavingContribution, Transaction } from '../../types';
import type { TranslationKey } from '../../i18n/translations';

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
  // Reset to one page whenever the scope changes - see setPeriod and
  // selectCategory below.
  const [pages, setPages] = useState(1);

  // One period drives Summary, the category chips, and the list, so there is
  // never more than one time filter in play.
  const periodScoped = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);
  const chips = useMemo(() => deriveCategories(periodScoped), [periodScoped]);
  const visible = useMemo(() => applyCategoryFilter(periodScoped, category), [periodScoped, category]);
  const page = useMemo(() => pageSlice(visible, pages), [visible, pages]);
  const totals = useMemo(() => computeTotals(periodScoped), [periodScoped]);
  const balance = useMemo(() => computeBalance(transactions), [transactions]);

  // Deliberately not period-scoped: this always compares this calendar month
  // with last, so it means the same thing wherever the user has navigated.
  const trend = useMemo(() => computeSpendingTrend(transactions, todayISO), [transactions, todayISO]);
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

  const emptyKey: TranslationKey = category
    ? 'emptyCategoryFiltered'
    : transactions.length === 0
      ? 'emptyTransactions'
      : period.kind === 'date'
        ? 'emptyDayFiltered'
        : 'emptyPeriodFiltered';

  return (
    <>
      <PeriodBar period={period} todayISO={todayISO} months={months} onChange={setPeriod} />
      <Summary
        balance={balance}
        income={totals.income}
        expense={totals.expense}
        period={period}
        todayISO={todayISO}
        debt={debts.length > 0 ? debtSummary : null}
      />
      {/* Above savings goals: "what can I spend today" is the question the app
          is opened to answer; a goal is something checked on. */}
      <AllocationsStrip
        allocations={allocations}
        transactions={transactions}
        todayISO={todayISO}
        onOpen={onOpenAllocation}
        onAdd={onAddAllocation}
      />
      <SavingsStrip savings={savings} contributions={savingContributions} onOpen={onOpenSaving} />
      <SpendingTrendMessage trend={trend} />
      {/* The heatmap gets full history on purpose - its shading percentiles
          need the whole range, and it is the navigator for picking a date.
          The breakdown gets the period, since that is the question it
          answers. */}
      <SpendingChart
        transactions={transactions}
        periodTransactions={periodScoped}
        todayISO={todayISO}
        selectedDate={period.kind === 'date' ? period.date : null}
        onSelectDate={(date) => setPeriod(date ? { kind: 'date', date } : currentMonth(todayISO))}
      />
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
    </>
  );
}
