# Transaction Pagination and Money Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginate the transaction list at 30 rows per page, and add an envelope-budgeting feature where a named allocation claims spending categories, refills on a cadence, and rolls its leftover forward.

**Architecture:** All calculation lives in pure modules under `src/features/` with their own Vitest files; React components stay presentational. The new `Allocation` entity follows the existing sheet-backed entity path end to end — `types.ts` → `normalize.ts` → `sheetApi.ts` → `Code.gs` → `localCache.ts` → `useFinanceStore.ts` → feature folder — copying the savings implementation, which is the closest existing analogue.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (jsdom), Google Apps Script backend, no runtime dependencies beyond `react` and `react-dom`.

**Spec:** `docs/superpowers/specs/2026-08-03-pagination-and-allocation-design.md`

## Global Constraints

- **Do not add npm dependencies.** `package.json` has exactly `react` and `react-dom` as runtime dependencies. Keep it that way.
- **Vitest only collects `src/**/*.test.ts`, `google-apps-script/**/*.test.ts`, `tests/**/*.test.ts`** (see `vitest.config.ts`) — note `.ts`, not `.tsx`. There is no component-testing library and none is to be added. Logic that needs testing goes in a pure `.ts` module; UI tasks are verified with `pnpm typecheck`, `pnpm build`, and stated manual checks.
- **Money is an integer number of IDR** with no decimal subunit. Format with `formatIDR` and read with `parseAmount`, both from `src/utils/money.ts`. Never hand-roll currency formatting.
- **Dates are ISO `YYYY-MM-DD` strings.** Compare them as strings; they sort correctly. When date *arithmetic* is unavoidable use `Date.UTC`, never local-time `Date` constructors — see `src/utils/period.ts:47` for the existing precedent.
- **Every user-visible string goes through `t('key')`** and needs an entry in both `en` and `id` in `src/i18n/translations.ts`. `id` is typed `Record<TranslationKey, string>`, so a missing Indonesian string is a compile error.
- **`Code.gs` is ES5.** No `let`, `const`, arrow functions, `Array.prototype.includes`, or template literals. Use `var`, `function`, and string concatenation.
- **Commands:** `pnpm test` (once), `pnpm test:watch`, `pnpm typecheck`, `pnpm build`, `pnpm dev`. Run a single file with `pnpm vitest run <path>`.
- **Commit after every task.** Conventional-commit prefixes (`feat:`, `refactor:`, `test:`, `docs:`), matching existing history.

---

# Part 1 — Pagination

### Task 1: `pagination.ts` pure module

**Files:**
- Create: `src/features/transactions/pagination.ts`
- Test: `src/features/transactions/pagination.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PAGE_SIZE: number` (30), `interface Page<T> { rows: T[]; remaining: number; hasMore: boolean }`, and `pageSlice<T>(items: T[], pages: number): Page<T>`. Task 3 consumes all three.

- [ ] **Step 1: Write the failing test**

Create `src/features/transactions/pagination.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, pageSlice } from './pagination';

const items = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('pageSlice', () => {
  it('shows one page by default', () => {
    const page = pageSlice(items(100), 1);
    expect(page.rows).toHaveLength(PAGE_SIZE);
    expect(page.remaining).toBe(70);
    expect(page.hasMore).toBe(true);
  });

  it('grows by a whole page at a time', () => {
    expect(pageSlice(items(100), 2).rows).toHaveLength(60);
    expect(pageSlice(items(100), 3).rows).toHaveLength(90);
  });

  it('reports nothing remaining when the last page exactly fills', () => {
    const page = pageSlice(items(60), 2);
    expect(page.rows).toHaveLength(60);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  it('does not pad when there are fewer items than one page', () => {
    const page = pageSlice(items(7), 1);
    expect(page.rows).toHaveLength(7);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  it('handles an empty list', () => {
    const page = pageSlice([], 1);
    expect(page.rows).toEqual([]);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  // A page count past the end must not produce a negative "remaining", which
  // would render as "Load more (-14 remaining)".
  it('clamps a page count past the end', () => {
    const page = pageSlice(items(10), 99);
    expect(page.rows).toHaveLength(10);
    expect(page.remaining).toBe(0);
    expect(page.hasMore).toBe(false);
  });

  it('treats a page count below one as a single page', () => {
    expect(pageSlice(items(100), 0).rows).toHaveLength(PAGE_SIZE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/transactions/pagination.test.ts`
Expected: FAIL — `Failed to resolve import "./pagination"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/transactions/pagination.ts`:

```ts
/**
 * How many transactions the list reveals at a time. Pagination is a rendering
 * concern only - the summary, charts and heatmap keep reading the full period,
 * so no total changes because the user has not pressed "load more" yet.
 */
export const PAGE_SIZE = 30;

export interface Page<T> {
  rows: T[];
  /** How many items are still hidden. Never negative. */
  remaining: number;
  hasMore: boolean;
}

/**
 * The first `pages` pages of `items`, plus what is left over.
 *
 * `pages` is clamped at one so an unexpected 0 renders a page rather than an
 * empty list, and the slice is bounded by the array itself so a count past the
 * end degrades to "everything, nothing hidden".
 */
export function pageSlice<T>(items: T[], pages: number): Page<T> {
  const limit = Math.max(1, Math.floor(pages)) * PAGE_SIZE;
  const rows = items.slice(0, limit);
  const remaining = items.length - rows.length;
  return { rows, remaining, hasMore: remaining > 0 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/transactions/pagination.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/pagination.ts src/features/transactions/pagination.test.ts
git commit -m "feat: add pageSlice helper for the transaction list"
```

---

### Task 2: Extract `TransactionsScreen` from `AppShell`

Pure refactor. No behaviour changes, no new props, nothing added or removed from the UI. Doing it separately means Task 3's diff is only the pagination.

**Files:**
- Create: `src/features/transactions/TransactionsScreen.tsx`
- Modify: `src/AppShell.tsx` (imports at 7–12, the `useMemo` block at 132–142, `emptyKey` at 175–181, and the JSX at 459–494)

**Interfaces:**
- Consumes: existing components `PeriodBar`, `Summary`, `SavingsStrip`, `SpendingTrendMessage`, `SpendingChart`, `CategoryFilter`, `TransactionList`; the pure helpers `filterByPeriod`, `availableMonths`, `computeTotals`, `computeBalance`, `computeSpendingTrend`, `deriveCategories`, `applyCategoryFilter`, `sameChip`.
- Produces: `TransactionsScreen` (default export) with this exact props interface, consumed by `AppShell` and extended in Tasks 3, 14 and 15:

```ts
export interface TransactionsScreenProps {
  transactions: Transaction[];
  savings: Saving[];
  savingContributions: SavingContribution[];
  debts: Debt[];
  debtSummary: AllDebtsSummary;
  accountLabels: Map<string, string>;
  todayISO: string;
  onEditTransaction: (txn: Transaction) => void;
  onOpenSaving: (saving: Saving) => void;
}
```

- [ ] **Step 1: Create the screen component**

Create `src/features/transactions/TransactionsScreen.tsx`. This is a move, not a rewrite: the period/category state and the memos come across unchanged from `AppShell`.

```tsx
import { useCallback, useMemo, useState } from 'react';
import PeriodBar from './PeriodBar';
import Summary from './Summary';
import SpendingTrendMessage from './SpendingTrendMessage';
import SpendingChart from './SpendingChart';
import CategoryFilter from './CategoryFilter';
import TransactionList from './TransactionList';
import SavingsStrip from '../savings/SavingsStrip';
import { computeSpendingTrend } from './spendingTrend';
import { applyCategoryFilter, deriveCategories, sameChip, type CategoryChip } from './categoryChips';
import { computeBalance, computeTotals } from '../../utils/summary';
import { availableMonths, currentMonth, filterByPeriod, type Period } from '../../utils/period';
import type { AllDebtsSummary } from '../debts/debt';
import type { Debt, Saving, SavingContribution, Transaction } from '../../types';
import type { TranslationKey } from '../../i18n/translations';

export interface TransactionsScreenProps {
  transactions: Transaction[];
  savings: Saving[];
  savingContributions: SavingContribution[];
  debts: Debt[];
  debtSummary: AllDebtsSummary;
  accountLabels: Map<string, string>;
  todayISO: string;
  onEditTransaction: (txn: Transaction) => void;
  onOpenSaving: (saving: Saving) => void;
}

export default function TransactionsScreen({
  transactions,
  savings,
  savingContributions,
  debts,
  debtSummary,
  accountLabels,
  todayISO,
  onEditTransaction,
  onOpenSaving
}: TransactionsScreenProps) {
  const [period, setPeriodState] = useState<Period>(() => currentMonth(todayISO));
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
      <CategoryFilter chips={chips} selected={category} onSelect={setCategory} />
      <TransactionList
        transactions={visible}
        todayISO={todayISO}
        emptyKey={emptyKey}
        accountLabels={accountLabels}
        onEdit={onEditTransaction}
      />
    </>
  );
}
```

- [ ] **Step 2: Strip the moved code out of `AppShell`**

In `src/AppShell.tsx`:

1. Delete these imports (now only used by the new screen): `PeriodBar`, `Summary`, `SpendingTrendMessage`, `SpendingChart`, `CategoryFilter`, `TransactionList`, `SavingsStrip`, `computeBalance`, `computeTotals`, `computeSpendingTrend`, `applyCategoryFilter`, `deriveCategories`, `sameChip`, `CategoryChip`, `TranslationKey`, and `availableMonths` / `filterByPeriod` / `currentMonth` / `Period` from `utils/period`.
2. Add: `import TransactionsScreen from './features/transactions/TransactionsScreen';`
3. Delete the state `period` and `category`, the memos `periodScoped` / `chips` / `visible` / `totals` / `balance` / `trend` / `months`, the `setPeriod` callback, and the `emptyKey` block.
4. Keep `today`, `debtSummary` and `accountLabels` — `AppShell` still owns them.
5. Replace the JSX at 459–494 (the `<>…</>` transactions branch) with:

```tsx
<TransactionsScreen
  transactions={transactions}
  savings={savings}
  savingContributions={savingContributions}
  debts={debts}
  debtSummary={debtSummary}
  accountLabels={accountLabels}
  todayISO={today}
  onEditTransaction={(txn) => setEditor(txn)}
  onOpenSaving={(saving) => setOpenSavingId(saving.id)}
/>
```

- [ ] **Step 3: Verify nothing broke**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: no type errors, all existing tests pass, build succeeds. TypeScript will name any import you left behind unused or any prop you missed.

- [ ] **Step 4: Verify in the browser**

Run `pnpm dev`, open the app, and confirm the transactions tab is unchanged: the period bar switches months, the category chips filter, tapping a heatmap day scopes to that date, and tapping a transaction opens the edit modal. Switch to the Accounts, Debts and Savings tabs and back.

- [ ] **Step 5: Commit**

```bash
git add src/AppShell.tsx src/features/transactions/TransactionsScreen.tsx
git commit -m "refactor: extract TransactionsScreen from AppShell"
```

---

### Task 3: Wire pagination into the list

**Files:**
- Modify: `src/features/transactions/TransactionsScreen.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/features/transactions/TransactionList.css`

**Interfaces:**
- Consumes: `PAGE_SIZE`, `pageSlice` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the translation keys**

In `src/i18n/translations.ts`, inside the `en` object near the other transaction-list keys:

```ts
  loadMoreRemaining: 'Load more ({count} remaining)',
```

And the matching entry in the `id` object (which starts at line 267):

```ts
  loadMoreRemaining: 'Muat lagi ({count} tersisa)',
```

- [ ] **Step 2: Paginate the list**

In `TransactionsScreen.tsx`, add the import:

```tsx
import { pageSlice } from './pagination';
```

Add the state next to `period` and `category`:

```tsx
  // Reset to one page whenever the scope changes - see setPeriod and
  // selectCategory below.
  const [pages, setPages] = useState(1);
```

Add the slice after the `visible` memo:

```tsx
  const page = useMemo(() => pageSlice(visible, pages), [visible, pages]);
```

Reset `pages` inside the existing `setPeriod` callback, as its first statement:

```tsx
  const setPeriod = useCallback(
    (next: Period) => {
      setPages(1);
      setPeriodState(next);
      // …existing category reconciliation, unchanged…
    },
    [transactions]
  );
```

Add a category setter that does the same, and pass it to `CategoryFilter` instead of the bare `setCategory`:

```tsx
  /**
   * Paired with setPeriod: both reset paging, synchronously rather than in an
   * effect, so the list never renders page 3 of a filter that just changed.
   */
  const selectCategory = useCallback((next: CategoryChip | null) => {
    setPages(1);
    setCategory(next);
  }, []);
```

Change the `CategoryFilter` usage to `onSelect={selectCategory}`, and the `TransactionList` usage to `transactions={page.rows}`.

- [ ] **Step 3: Add the Load more button**

Immediately after `<TransactionList … />` in the returned JSX:

```tsx
      {page.hasMore && (
        <button
          type="button"
          className="txn-list__more"
          onClick={() => setPages((n) => n + 1)}
        >
          {t('loadMoreRemaining', { count: page.remaining })}
        </button>
      )}
```

This needs the i18n hook, so add `import { useI18n } from '../../i18n/context';` and `const { t } = useI18n();` at the top of the component body.

- [ ] **Step 4: Style the button**

Append to `src/features/transactions/TransactionList.css`:

```css
/* Full width so it reads as the end of the list rather than an action on the
   last card above it. */
.txn-list__more {
  display: block; width: 100%; margin: 0.5rem 0 1rem;
  padding: 0.75rem; min-height: 44px;
  border: 1px solid var(--line); border-radius: 12px;
  background: var(--surface); color: var(--accent-strong);
  font-size: 0.9rem; font-weight: 600;
}
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: clean.

- [ ] **Step 6: Verify in the browser**

Run `pnpm dev`. With a month holding more than 30 transactions, confirm: exactly 30 render; the button reads the correct remaining count; tapping it appends the next 30 and the day headings stay correct with no duplicates; switching month or tapping a category chip snaps back to 30; the summary and charts show the same totals before and after loading more.

If your sheet has no month with 30+ rows, add throwaway rows in the Google Sheet to test, then delete them.

- [ ] **Step 7: Commit**

```bash
git add src/features/transactions/TransactionsScreen.tsx src/features/transactions/TransactionList.css src/i18n/translations.ts
git commit -m "feat: paginate the transaction list at 30 rows"
```

---

# Part 2 — Money Allocation

### Task 4: `Allocation` type and normalizer

**Files:**
- Modify: `src/types.ts` (add after the `SavingContribution` interface, before `SyncOperation`)
- Modify: `src/utils/normalize.ts`
- Test: `src/utils/normalize.test.ts` (existing file — add a describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: `Allocation`, `AllocationCadence` (from `types.ts`) and `normalizeAllocation(raw: Partial<Allocation>): Allocation` (from `normalize.ts`). Every later allocation task consumes these.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/normalize.test.ts` (keep the existing imports; add `normalizeAllocation` to the import from `./normalize`):

```ts
describe('normalizeAllocation', () => {
  it('coerces a well-formed row', () => {
    const a = normalizeAllocation({
      id: 'a1',
      name: 'Food',
      amount: 50000,
      cadence: 'daily',
      categories: ['Food'],
      startDate: '2026-08-01',
      openingBalance: 0,
      createdAt: 'ts'
    });
    expect(a.name).toBe('Food');
    expect(a.amount).toBe(50000);
    expect(a.cadence).toBe('daily');
    expect(a.categories).toEqual(['Food']);
  });

  it('falls back to daily for an unknown cadence', () => {
    const a = normalizeAllocation({ cadence: 'fortnightly' as never });
    expect(a.cadence).toBe('daily');
  });

  it('reads a JSON array of categories from a single cell', () => {
    const a = normalizeAllocation({ categories: '["Food","Groceries"]' as never });
    expect(a.categories).toEqual(['Food', 'Groceries']);
  });

  // The sheet is the user's own file and they may edit this cell by hand.
  it('falls back to splitting on commas', () => {
    const a = normalizeAllocation({ categories: 'Food, Groceries ' as never });
    expect(a.categories).toEqual(['Food', 'Groceries']);
  });

  it('drops blank category entries', () => {
    const a = normalizeAllocation({ categories: 'Food,,  ,Transport' as never });
    expect(a.categories).toEqual(['Food', 'Transport']);
  });

  it('reads a missing categories cell as claiming nothing', () => {
    expect(normalizeAllocation({}).categories).toEqual([]);
  });

  // A rebase on an overspent envelope writes a negative opening balance.
  it('keeps a negative opening balance', () => {
    expect(normalizeAllocation({ openingBalance: -200000 }).openingBalance).toBe(-200000);
  });

  it('trims a timestamp in the start date down to a calendar date', () => {
    expect(normalizeAllocation({ startDate: '2026-08-01T00:00:00.000Z' }).startDate)
      .toBe('2026-08-01');
  });

  it('defaults intervalDays to 1 so day arithmetic can never divide by zero', () => {
    expect(normalizeAllocation({}).intervalDays).toBe(1);
    expect(normalizeAllocation({ intervalDays: 0 }).intervalDays).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/utils/normalize.test.ts`
Expected: FAIL — `normalizeAllocation` is not exported.

- [ ] **Step 3: Add the type**

In `src/types.ts`, after the `SavingContribution` interface:

```ts
/** How often an allocation refills. 'days' carries its own interval. */
export type AllocationCadence = 'daily' | 'weekly' | 'monthly' | 'days';

/**
 * An envelope: a named pot that claims spending categories, refills on a
 * cadence, and rolls its leftover forward. Funding is an earmark, never a
 * movement - creating one writes no transaction, exactly like
 * SavingContribution.
 */
export interface Allocation {
  id: string;
  name: string;
  /** Single emoji, optional. */
  icon?: string;
  /** IDR granted per period. */
  amount: number;
  cadence: AllocationCadence;
  /** The N in "every N days". Only meaningful when cadence is 'days'. */
  intervalDays?: number;
  /** Categories this envelope claims. Expenses in them draw it down. */
  categories: string[];
  /** Anchors period boundaries and the rollover clock. Moves on rebase. */
  startDate: string;
  /** Balance carried in at startDate. 0 for a new envelope; set by a rebase. */
  openingBalance: number;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}
```

And add `'allocation'` to the `SyncEntity` union:

```ts
export type SyncEntity =
  | 'transaction'
  | 'account'
  | 'transfer'
  | 'debt'
  | 'debtInstalment'
  | 'saving'
  | 'savingContribution'
  | 'allocation';
```

- [ ] **Step 4: Add the normalizer**

In `src/utils/normalize.ts`, add `Allocation` and `AllocationCadence` to the type import, then append:

```ts
const CADENCES: AllocationCadence[] = ['daily', 'weekly', 'monthly', 'days'];

/**
 * `categories` is one cell holding a list, so it is the field most likely to
 * arrive malformed - and the consequence is worse than for a scalar: an
 * unreadable cell would silently unclaim every category and inflate the
 * envelope. A JSON array is what we write; a comma-separated string is what a
 * user editing the sheet by hand would type. Both are accepted.
 */
function categoryList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(str).map((c) => c.trim()).filter(Boolean);

  const text = str(raw).trim();
  if (text === '') return [];

  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(str).map((c) => c.trim()).filter(Boolean);
    } catch {
      // Not valid JSON after all - fall through to the comma split.
    }
  }

  return text.split(',').map((c) => c.trim()).filter(Boolean);
}

export function normalizeAllocation(raw: Partial<Allocation>): Allocation {
  const interval = num(raw.intervalDays);
  return {
    id: str(raw.id),
    name: str(raw.name),
    icon: raw.icon == null ? '' : str(raw.icon),
    amount: num(raw.amount),
    cadence: CADENCES.includes(raw.cadence as AllocationCadence)
      ? (raw.cadence as AllocationCadence)
      : 'daily',
    // Never zero: it divides in the period arithmetic.
    intervalDays: interval >= 1 ? Math.floor(interval) : 1,
    categories: categoryList(raw.categories),
    startDate: str(raw.startDate).slice(0, 10),
    // num() keeps negatives, which a rebase on an overspent envelope produces.
    openingBalance: num(raw.openingBalance),
    note: raw.note == null ? '' : str(raw.note),
    createdAt: str(raw.createdAt)
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/utils/normalize.test.ts && pnpm typecheck`
Expected: PASS. `typecheck` may now flag `useFinanceStore.ts` for a non-exhaustive `SyncEntity` switch — it will not, because `dispatch` uses `if` chains with a fallthrough. If anything does fail, that is Task 9's job; note it and move on only if the failure is in `useFinanceStore.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/utils/normalize.ts src/utils/normalize.test.ts
git commit -m "feat: add Allocation type and normalizer"
```

---

### Task 5: Allocation period arithmetic

The date maths, on its own, because it carries the subtle cases (month-end clamping, leap years) and deserves its own review gate.

**Files:**
- Create: `src/features/allocations/allocations.ts`
- Test: `src/features/allocations/allocations.test.ts`

**Interfaces:**
- Consumes: `Allocation` (Task 4).
- Produces, all consumed by Task 6:
  - `interface AllocationPeriod { start: string; end: string }`
  - `periodsElapsed(allocation: Allocation, todayISO: string): number`
  - `currentPeriod(allocation: Allocation, todayISO: string): AllocationPeriod`

- [ ] **Step 1: Write the failing test**

Create `src/features/allocations/allocations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { currentPeriod, periodsElapsed } from './allocations';
import type { Allocation } from '../../types';

function make(over: Partial<Allocation> = {}): Allocation {
  return {
    id: 'a1',
    name: 'Food',
    icon: '',
    amount: 50000,
    cadence: 'daily',
    intervalDays: 1,
    categories: ['Food'],
    startDate: '2026-08-01',
    openingBalance: 0,
    note: '',
    createdAt: 'ts',
    ...over
  };
}

describe('periodsElapsed', () => {
  it('counts the start date itself as period one', () => {
    expect(periodsElapsed(make(), '2026-08-01')).toBe(1);
  });

  it('counts a day per period when daily', () => {
    expect(periodsElapsed(make(), '2026-08-10')).toBe(10);
  });

  it('counts a week per period when weekly', () => {
    const a = make({ cadence: 'weekly' });
    expect(periodsElapsed(a, '2026-08-07')).toBe(1);
    expect(periodsElapsed(a, '2026-08-08')).toBe(2);
  });

  it('uses intervalDays when the cadence is days', () => {
    const a = make({ cadence: 'days', intervalDays: 10 });
    expect(periodsElapsed(a, '2026-08-10')).toBe(1);
    expect(periodsElapsed(a, '2026-08-11')).toBe(2);
  });

  it('counts calendar months when monthly', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-15' });
    expect(periodsElapsed(a, '2026-01-14')).toBe(0);
    expect(periodsElapsed(a, '2026-01-15')).toBe(1);
    expect(periodsElapsed(a, '2026-02-14')).toBe(1);
    expect(periodsElapsed(a, '2026-02-15')).toBe(2);
    expect(periodsElapsed(a, '2026-04-20')).toBe(4);
  });

  // A monthly envelope anchored past the end of a short month must not skip it.
  it('clamps a month anchor of 31 into February', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-31' });
    expect(periodsElapsed(a, '2026-02-27')).toBe(1);
    expect(periodsElapsed(a, '2026-02-28')).toBe(2);
    expect(periodsElapsed(a, '2026-03-30')).toBe(2);
    expect(periodsElapsed(a, '2026-03-31')).toBe(3);
  });

  it('uses 29 February in a leap year', () => {
    const a = make({ cadence: 'monthly', startDate: '2028-01-31' });
    expect(periodsElapsed(a, '2028-02-28')).toBe(1);
    expect(periodsElapsed(a, '2028-02-29')).toBe(2);
  });

  it('crosses a year boundary', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-11-10' });
    expect(periodsElapsed(a, '2027-01-10')).toBe(3);
  });

  it('reports zero before the envelope starts', () => {
    expect(periodsElapsed(make({ startDate: '2026-09-01' }), '2026-08-15')).toBe(0);
  });
});

describe('currentPeriod', () => {
  it('is the single day when daily', () => {
    expect(currentPeriod(make(), '2026-08-10')).toEqual({
      start: '2026-08-10',
      end: '2026-08-10'
    });
  });

  it('runs from the anchor for a whole week when weekly', () => {
    expect(currentPeriod(make({ cadence: 'weekly' }), '2026-08-09')).toEqual({
      start: '2026-08-08',
      end: '2026-08-14'
    });
  });

  it('runs anchor to the day before the next anchor when monthly', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-15' });
    expect(currentPeriod(a, '2026-03-02')).toEqual({
      start: '2026-02-15',
      end: '2026-03-14'
    });
  });

  it('clamps both ends of a 31st-anchored month', () => {
    const a = make({ cadence: 'monthly', startDate: '2026-01-31' });
    expect(currentPeriod(a, '2026-02-28')).toEqual({
      start: '2026-02-28',
      end: '2026-03-30'
    });
  });

  it('reports the first period before the envelope starts', () => {
    expect(currentPeriod(make({ startDate: '2026-09-01' }), '2026-08-15')).toEqual({
      start: '2026-09-01',
      end: '2026-09-01'
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/allocations/allocations.test.ts`
Expected: FAIL — `Failed to resolve import "./allocations"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/allocations/allocations.ts`:

```ts
import type { Allocation } from '../../types';

/** One refill window, both ends inclusive ISO dates. */
export interface AllocationPeriod {
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

/**
 * All date arithmetic goes through UTC. A local-time Date would shift by an
 * hour across a DST boundary and round a day-count to the wrong integer -
 * the same reason period.ts pins its month formatting to UTC.
 */
function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return toISO(toUTC(iso) + days * DAY_MS);
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * `months` after `iso`, holding the day-of-month at `anchorDay` and clamping
 * to the last day of a shorter month. Without the clamp a 31st-anchored
 * envelope would skip February entirely by rolling into March.
 */
function addMonths(iso: string, months: number, anchorDay: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12; // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(anchorDay, lastDay))}`;
}

/** How many days one period spans. Monthly does not use this. */
function intervalDays(allocation: Allocation): number {
  if (allocation.cadence === 'weekly') return 7;
  if (allocation.cadence === 'days') {
    const n = Math.floor(allocation.intervalDays ?? 1);
    return n >= 1 ? n : 1;
  }
  return 1;
}

const anchorDayOf = (allocation: Allocation): number =>
  Number(allocation.startDate.slice(8, 10));

/**
 * Periods that have begun on or before today, counting the start date itself
 * as period 1. Zero when the envelope has not started yet, so a future start
 * date grants nothing rather than borrowing against itself.
 */
export function periodsElapsed(allocation: Allocation, todayISO: string): number {
  if (todayISO < allocation.startDate) return 0;

  if (allocation.cadence === 'monthly') {
    const [sy, sm] = allocation.startDate.split('-').map(Number);
    const [ty, tm] = todayISO.split('-').map(Number);
    const monthsApart = (ty - sy) * 12 + (tm - sm);
    const anchor = addMonths(allocation.startDate, monthsApart, anchorDayOf(allocation));
    return monthsApart + (todayISO >= anchor ? 1 : 0);
  }

  return Math.floor(daysBetween(allocation.startDate, todayISO) / intervalDays(allocation)) + 1;
}

/**
 * The window containing today. Before the envelope starts this reports the
 * first period, so the detail modal always has a window to name.
 */
export function currentPeriod(allocation: Allocation, todayISO: string): AllocationPeriod {
  const index = Math.max(0, periodsElapsed(allocation, todayISO) - 1);

  if (allocation.cadence === 'monthly') {
    const day = anchorDayOf(allocation);
    const start = addMonths(allocation.startDate, index, day);
    const next = addMonths(allocation.startDate, index + 1, day);
    return { start, end: addDays(next, -1) };
  }

  const span = intervalDays(allocation);
  const start = addDays(allocation.startDate, index * span);
  return { start, end: addDays(start, span - 1) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/features/allocations/allocations.test.ts`
Expected: PASS, all cases in both describes.

- [ ] **Step 5: Commit**

```bash
git add src/features/allocations/allocations.ts src/features/allocations/allocations.test.ts
git commit -m "feat: add allocation period arithmetic"
```

---

### Task 6: Allocation summaries, rebase and reset

**Files:**
- Modify: `src/features/allocations/allocations.ts`
- Modify: `src/features/allocations/allocations.test.ts`

**Interfaces:**
- Consumes: `periodsElapsed`, `currentPeriod` (Task 5); `Allocation`, `Transaction`.
- Produces, consumed by Tasks 11–15:
  - `interface AllocationSummary` — fields `periodStart`, `periodEnd`, `periodsElapsed`, `granted`, `spent`, `available`, `spentThisPeriod`, `periodRemaining`, `isOverdrawn`
  - `interface AllocationRow { allocation: Allocation; summary: AllocationSummary }`
  - `resolveClaims(allocations: Allocation[]): Map<string, string[]>`
  - `summarizeAllocations(allocations: Allocation[], transactions: Transaction[], todayISO: string): AllocationRow[]`
  - `totalAllocated(rows: AllocationRow[]): number`
  - `unallocated(balance: number, rows: AllocationRow[]): number`
  - `rebase(allocation, allocations, transactions, todayISO): { openingBalance: number; startDate: string }`
  - `resetRollover(todayISO: string): { openingBalance: number; startDate: string }`
  - `needsRebase(before: Allocation, after: AllocationFormShape): boolean` where `AllocationFormShape = Pick<Allocation, 'amount' | 'cadence' | 'intervalDays' | 'categories'>`

- [ ] **Step 1: Write the failing test**

Append to `src/features/allocations/allocations.test.ts` (extend the top import to include the new names, and add `import type { Transaction } from '../../types';`):

```ts
function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    type: 'expense',
    amount: 10000,
    category: 'Food',
    date: '2026-08-01',
    note: '',
    createdAt: 'ts',
    accountId: '',
    ...over
  };
}

describe('summarizeAllocations', () => {
  const today = '2026-08-03';

  it('grants one amount per elapsed period', () => {
    const [row] = summarizeAllocations([make()], [], today);
    expect(row.summary.periodsElapsed).toBe(3);
    expect(row.summary.granted).toBe(150000);
    expect(row.summary.available).toBe(150000);
  });

  it('carries an opening balance in', () => {
    const [row] = summarizeAllocations([make({ openingBalance: 20000 })], [], today);
    expect(row.summary.granted).toBe(170000);
  });

  it('draws down on expenses in a claimed category', () => {
    const [row] = summarizeAllocations([make()], [txn({ amount: 30000 })], today);
    expect(row.summary.spent).toBe(30000);
    expect(row.summary.available).toBe(120000);
  });

  it('ignores expenses in categories it does not claim', () => {
    const [row] = summarizeAllocations([make()], [txn({ category: 'Transport' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('matches a category exactly, so Food and food stay distinct', () => {
    const [row] = summarizeAllocations([make()], [txn({ category: 'food' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('ignores income landing in a claimed category', () => {
    const [row] = summarizeAllocations([make()], [txn({ type: 'income', amount: 90000 })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('ignores spending from before the envelope started', () => {
    const [row] = summarizeAllocations([make()], [txn({ date: '2026-07-20' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('ignores future-dated spending until its date arrives', () => {
    const [row] = summarizeAllocations([make()], [txn({ date: '2026-08-20' })], today);
    expect(row.summary.spent).toBe(0);
  });

  it('goes negative when overdrawn', () => {
    const [row] = summarizeAllocations([make()], [txn({ amount: 400000 })], today);
    expect(row.summary.available).toBe(-250000);
    expect(row.summary.isOverdrawn).toBe(true);
  });

  it('reports this period separately from the running total', () => {
    const rows = summarizeAllocations(
      [make()],
      [txn({ id: 't1', date: '2026-08-01', amount: 20000 }),
       txn({ id: 't2', date: '2026-08-03', amount: 5000 })],
      today
    );
    expect(rows[0].summary.spent).toBe(25000);
    expect(rows[0].summary.spentThisPeriod).toBe(5000);
    expect(rows[0].summary.periodRemaining).toBe(45000);
  });

  // A hand-edited sheet can put one category in two envelopes. Under-counting
  // is wrong once; double-counting is wrong twice.
  it('gives a contested category to the first claimant only', () => {
    const first = make({ id: 'a1', createdAt: '2026-01-01' });
    const second = make({ id: 'a2', createdAt: '2026-02-01' });
    const rows = summarizeAllocations([second, first], [txn({ amount: 30000 })], today);
    const byId = new Map(rows.map((r) => [r.allocation.id, r.summary]));
    expect(byId.get('a1')!.spent).toBe(30000);
    expect(byId.get('a2')!.spent).toBe(0);
  });
});

describe('unallocated', () => {
  const today = '2026-08-03';

  it('subtracts what the envelopes still hold', () => {
    const rows = summarizeAllocations([make()], [], today);
    expect(totalAllocated(rows)).toBe(150000);
    expect(unallocated(500000, rows)).toBe(350000);
  });

  // An overdrawn envelope holds nothing; that money already left the balance,
  // so counting it as a negative claim would report more free cash than exists.
  it('clamps an overdrawn envelope at zero', () => {
    const rows = summarizeAllocations([make()], [txn({ amount: 400000 })], today);
    expect(totalAllocated(rows)).toBe(0);
    expect(unallocated(500000, rows)).toBe(500000);
  });

  it('goes negative when the envelopes promise more than is held', () => {
    const rows = summarizeAllocations([make({ openingBalance: 900000 })], [], today);
    expect(unallocated(500000, rows)).toBe(-550000);
  });
});

describe('rebase', () => {
  const today = '2026-08-03';

  it('snapshots the current balance and restarts the clock', () => {
    const a = make();
    expect(rebase(a, [a], [txn({ amount: 30000 })], today)).toEqual({
      openingBalance: 120000,
      startDate: today
    });
  });

  it('carries a deficit rather than forgiving it', () => {
    const a = make();
    expect(rebase(a, [a], [txn({ amount: 400000 })], today).openingBalance).toBe(-250000);
  });
});

describe('resetRollover', () => {
  it('drops the carried balance and restarts today', () => {
    expect(resetRollover('2026-08-03')).toEqual({
      openingBalance: 0,
      startDate: '2026-08-03'
    });
  });

  // Reset clears the accumulation, not the current period's allowance: after
  // it, one full amount is granted, so the day is still spendable.
  it('leaves the current period fully granted', () => {
    const reset = resetRollover('2026-08-03');
    const a = make({ ...reset });
    const [row] = summarizeAllocations([a], [], '2026-08-03');
    expect(row.summary.available).toBe(50000);
  });
});

describe('needsRebase', () => {
  it('is true when the amount changes', () => {
    expect(needsRebase(make(), { ...make(), amount: 60000 })).toBe(true);
  });

  it('is true when the cadence changes', () => {
    expect(needsRebase(make(), { ...make(), cadence: 'weekly' })).toBe(true);
  });

  it('is true when the interval changes', () => {
    const before = make({ cadence: 'days', intervalDays: 10 });
    expect(needsRebase(before, { ...before, intervalDays: 14 })).toBe(true);
  });

  // Adding a category would otherwise let months of past spending in it
  // retroactively drain a pot that had been running fine.
  it('is true when the categories change', () => {
    expect(needsRebase(make(), { ...make(), categories: ['Food', 'Groceries'] })).toBe(true);
  });

  it('ignores category order', () => {
    const before = make({ categories: ['Food', 'Groceries'] });
    expect(needsRebase(before, { ...before, categories: ['Groceries', 'Food'] })).toBe(false);
  });

  it('is false when only the name changes', () => {
    expect(needsRebase(make(), { ...make() })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/allocations/allocations.test.ts`
Expected: FAIL — `summarizeAllocations is not a function` and similar for the other new exports.

- [ ] **Step 3: Write the implementation**

Append to `src/features/allocations/allocations.ts` (and add `Transaction` to the type import at the top):

```ts
export interface AllocationSummary {
  periodStart: string;
  /** Inclusive. */
  periodEnd: string;
  periodsElapsed: number;
  granted: number;
  /** Since startDate, up to and including today. */
  spent: number;
  /** granted - spent. Negative when overdrawn. */
  available: number;
  spentThisPeriod: number;
  /** amount - spentThisPeriod. Negative when this period is overspent. */
  periodRemaining: number;
  isOverdrawn: boolean;
}

export interface AllocationRow {
  allocation: Allocation;
  summary: AllocationSummary;
}

/** The subset of a form that can invalidate an envelope's accumulated history. */
export type AllocationFormShape = Pick<
  Allocation,
  'amount' | 'cadence' | 'intervalDays' | 'categories'
>;

/**
 * Which categories each envelope actually owns.
 *
 * One category belongs to one envelope. The form prevents a conflict, but the
 * sheet is the user's own file and can be edited into one, so the first
 * claimant wins here too - by createdAt, then id, so the answer does not
 * depend on the order rows came back from the sheet.
 */
export function resolveClaims(allocations: Allocation[]): Map<string, string[]> {
  const ordered = [...allocations].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.id.localeCompare(b.id);
  });

  const owner = new Map<string, string>();
  const owned = new Map<string, string[]>();

  for (const allocation of ordered) {
    const mine: string[] = [];
    for (const raw of allocation.categories) {
      const category = raw.trim();
      if (category === '' || owner.has(category)) continue;
      owner.set(category, allocation.id);
      mine.push(category);
    }
    owned.set(allocation.id, mine);
  }

  return owned;
}

function summarize(
  allocation: Allocation,
  owned: string[],
  transactions: Transaction[],
  todayISO: string
): AllocationSummary {
  const { start: periodStart, end: periodEnd } = currentPeriod(allocation, todayISO);
  const elapsed = periodsElapsed(allocation, todayISO);
  const claimed = new Set(owned);

  // The current period may run past today; only count as far as today so
  // "spent this period" cannot include a future-dated row.
  const periodCap = periodEnd < todayISO ? periodEnd : todayISO;

  let spent = 0;
  let spentThisPeriod = 0;

  for (const t of transactions) {
    // Income is ignored on purpose: an envelope is a spending allowance, and
    // netting a refund into it would move "left today" for a reason the user
    // did not act on. Transfers are a separate collection and never reach here.
    if (t.type !== 'expense') continue;
    if (!claimed.has(t.category.trim())) continue;
    if (t.date < allocation.startDate || t.date > todayISO) continue;

    spent += t.amount;
    if (t.date >= periodStart && t.date <= periodCap) spentThisPeriod += t.amount;
  }

  const granted = allocation.openingBalance + elapsed * allocation.amount;
  const available = granted - spent;

  return {
    periodStart,
    periodEnd,
    periodsElapsed: elapsed,
    granted,
    spent,
    available,
    spentThisPeriod,
    periodRemaining: allocation.amount - spentThisPeriod,
    isOverdrawn: available < 0
  };
}

/**
 * One pass over every envelope, so the strip, the detail modal and the
 * unallocated line are always reading the same numbers.
 */
export function summarizeAllocations(
  allocations: Allocation[],
  transactions: Transaction[],
  todayISO: string
): AllocationRow[] {
  const owned = resolveClaims(allocations);
  return allocations.map((allocation) => ({
    allocation,
    summary: summarize(allocation, owned.get(allocation.id) ?? [], transactions, todayISO)
  }));
}

/** What the envelopes are still holding. Overdrawn ones hold nothing. */
export function totalAllocated(rows: AllocationRow[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.summary.available), 0);
}

export function unallocated(balance: number, rows: AllocationRow[]): number {
  return balance - totalAllocated(rows);
}

/**
 * Because `available` is computed from `startDate`, changing the rule would
 * rewrite every past period. Rebasing instead snapshots what the envelope
 * holds right now and restarts the clock from today, so nothing is invented:
 * raising a daily allowance from 50k to 60k on a 200-day-old envelope would
 * otherwise silently grant Rp 2.000.000 of rollover that never existed.
 */
export function rebase(
  allocation: Allocation,
  allocations: Allocation[],
  transactions: Transaction[],
  todayISO: string
): { openingBalance: number; startDate: string } {
  const owned = resolveClaims(allocations).get(allocation.id) ?? [];
  const summary = summarize(allocation, owned, transactions, todayISO);
  return { openingBalance: summary.available, startDate: todayISO };
}

/**
 * Clears the accumulated carry-over - a surplus on a neglected envelope, or a
 * deficit on an overspent one - without touching the current period's
 * allowance. After a reset one full amount is granted, because a reset that
 * left nothing to spend until tomorrow is not what "start fresh" means.
 */
export function resetRollover(todayISO: string): { openingBalance: number; startDate: string } {
  return { openingBalance: 0, startDate: todayISO };
}

/** Whether an edit invalidates the accumulated history and must rebase. */
export function needsRebase(before: Allocation, after: AllocationFormShape): boolean {
  if (before.amount !== after.amount) return true;
  if (before.cadence !== after.cadence) return true;
  if ((before.intervalDays ?? 1) !== (after.intervalDays ?? 1)) return true;

  const sortedBefore = [...before.categories].sort().join(' ');
  const sortedAfter = [...after.categories].sort().join(' ');
  return sortedBefore !== sortedAfter;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/features/allocations/allocations.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/allocations/allocations.ts src/features/allocations/allocations.test.ts
git commit -m "feat: add allocation summaries, rebase and reset"
```

---

### Task 7: Apps Script support for the Allocations tab

**Files:**
- Modify: `google-apps-script/Code.gs`
- Test: `google-apps-script/Code.test.ts`

**Interfaces:**
- Consumes: existing `getSheetFor`, `readTab`, `findRowIndexById`, `normAmount`, `normDate`, `jsonResponse`.
- Produces: POST actions `addAllocation`, `updateAllocation`, `deleteAllocation`, and an `allocations` array on the `list` response. Task 8 consumes these.

Remember: `Code.gs` is ES5. No `let`/`const`/arrow functions/template literals.

- [ ] **Step 1: Write the failing test**

Append to `google-apps-script/Code.test.ts`:

```ts
describe('allocations', () => {
  const ALLOCATION_HEADERS = [
    'id', 'name', 'icon', 'amount', 'cadence', 'intervalDays',
    'categories', 'startDate', 'openingBalance', 'note', 'createdAt'
  ];

  const base = {
    name: 'Food',
    icon: '🍜',
    amount: 50000,
    cadence: 'daily',
    intervalDays: 1,
    categories: ['Food', 'Groceries'],
    startDate: '2026-08-01',
    openingBalance: 0,
    note: ''
  };

  it('creates the tab with headers on first write', () => {
    const { api, sheets } = loadCode();
    post(api, 'addAllocation', base);
    expect(sheets.get('Allocations')!.rows[0]).toEqual(ALLOCATION_HEADERS);
  });

  it('returns the created row', () => {
    const { api } = loadCode();
    const res = post(api, 'addAllocation', base);
    expect(res.success).toBe(true);
    expect(res.data.name).toBe('Food');
    expect(res.data.amount).toBe(50000);
    expect(res.data.categories).toEqual(['Food', 'Groceries']);
  });

  it('lists allocations', () => {
    const { api } = loadCode();
    post(api, 'addAllocation', base);
    const listed = get(api, 'list');
    expect(listed.data.allocations).toHaveLength(1);
    expect(listed.data.allocations[0].categories).toEqual(['Food', 'Groceries']);
  });

  it('does not create the tab merely by listing', () => {
    const { api, sheets } = loadCode();
    get(api, 'list');
    expect(sheets.has('Allocations')).toBe(false);
  });

  it('updates only the fields sent', () => {
    const { api } = loadCode();
    const created = post(api, 'addAllocation', base);
    const res = post(api, 'updateAllocation', { id: created.data.id, amount: 60000 });
    expect(res.success).toBe(true);
    expect(res.data.amount).toBe(60000);
    expect(res.data.name).toBe('Food');
    expect(res.data.categories).toEqual(['Food', 'Groceries']);
  });

  // A rebase on an overspent envelope writes a negative opening balance.
  it('stores a negative opening balance', () => {
    const { api } = loadCode();
    const created = post(api, 'addAllocation', base);
    const res = post(api, 'updateAllocation', {
      id: created.data.id,
      openingBalance: -200000,
      startDate: '2026-08-03'
    });
    expect(res.data.openingBalance).toBe(-200000);
    expect(res.data.startDate).toBe('2026-08-03');
  });

  it('reads a comma-separated categories cell written by hand', () => {
    const { api, sheets } = loadCode();
    post(api, 'addAllocation', base);
    const sheet = sheets.get('Allocations')!;
    sheet.rows[1][6] = 'Food, Transport';
    expect(get(api, 'list').data.allocations[0].categories).toEqual(['Food', 'Transport']);
  });

  it('deletes an allocation', () => {
    const { api } = loadCode();
    const created = post(api, 'addAllocation', base);
    expect(post(api, 'deleteAllocation', { id: created.data.id }).success).toBe(true);
    expect(get(api, 'list').data.allocations).toEqual([]);
  });

  it('reports a missing allocation rather than throwing', () => {
    const { api } = loadCode();
    post(api, 'addAllocation', base);
    expect(post(api, 'updateAllocation', { id: 'nope' }).success).toBe(false);
    expect(post(api, 'deleteAllocation', { id: 'nope' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run google-apps-script/Code.test.ts`
Expected: FAIL — `Unknown POST action: addAllocation`.

- [ ] **Step 3: Add the constants**

In `google-apps-script/Code.gs`, after the `CONTRIBUTION_HEADERS` line (37):

```js
// Envelope budgets. One row per envelope forever: the refill is a rule, so no
// per-period funding rows are ever written.
var ALLOCATIONS_SHEET = 'Allocations';
var ALLOCATION_HEADERS = [
  'id', 'name', 'icon', 'amount', 'cadence', 'intervalDays',
  'categories', 'startDate', 'openingBalance', 'note', 'createdAt'
];
```

- [ ] **Step 4: Add the row mapper and handlers**

Append after `deleteContribution` (line 616), before `doGet`:

```js
/**
 * `categories` is one cell holding a list. We write a JSON array; a user
 * editing the sheet by hand would type "Food, Groceries". Both are read, so a
 * hand-edited cell cannot silently unclaim every category.
 */
function parseCategoriesCell(cell) {
  var text = String(cell == null ? '' : cell).trim();
  if (text === '') return [];

  if (text.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(text);
      if (Object.prototype.toString.call(parsed) === '[object Array]') {
        return trimmedList(parsed);
      }
    } catch (err) {
      // Not valid JSON after all - fall through to the comma split.
    }
  }

  return trimmedList(text.split(','));
}

function trimmedList(items) {
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var value = String(items[i]).replace(/^\s+|\s+$/g, '');
    if (value !== '') out.push(value);
  }
  return out;
}

function categoriesToCell(value) {
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return JSON.stringify(trimmedList(value));
  }
  return JSON.stringify(parseCategoriesCell(value));
}

function allocationRowToObject(row) {
  var interval = normAmount(row[5]);
  return {
    id: String(row[0]),
    name: String(row[1]),
    icon: String(row[2] == null ? '' : row[2]),
    amount: normAmount(row[3]),
    cadence: String(row[4] || 'daily'),
    intervalDays: interval >= 1 ? interval : 1,
    categories: parseCategoriesCell(row[6]),
    startDate: normDate(row[7]),
    // normAmount keeps negatives: a rebase on an overspent envelope writes one.
    openingBalance: normAmount(row[8]),
    note: String(row[9] == null ? '' : row[9]),
    createdAt: String(row[10] == null ? '' : row[10])
  };
}

function addAllocation(data) {
  var sheet = getSheetFor(ALLOCATIONS_SHEET, ALLOCATION_HEADERS);
  var row = [
    Utilities.getUuid(),
    data.name || '',
    data.icon || '',
    normAmount(data.amount),
    data.cadence || 'daily',
    normAmount(data.intervalDays) >= 1 ? normAmount(data.intervalDays) : 1,
    categoriesToCell(data.categories),
    normDate(data.startDate || new Date()),
    normAmount(data.openingBalance),
    data.note || '',
    new Date().toISOString()
  ];
  sheet.appendRow(row);
  return { success: true, data: allocationRowToObject(row) };
}

function updateAllocation(data) {
  var sheet = getSheetFor(ALLOCATIONS_SHEET, ALLOCATION_HEADERS);
  var rowIndex = findRowIndexById(sheet, data.id);
  if (rowIndex === -1) return { success: false, error: 'Allocation not found' };
  var existing = sheet.getRange(rowIndex, 1, 1, ALLOCATION_HEADERS.length).getValues()[0];
  var updated = [
    existing[0],
    data.name != null ? data.name : existing[1],
    data.icon != null ? data.icon : existing[2],
    data.amount != null ? normAmount(data.amount) : existing[3],
    data.cadence != null ? data.cadence : existing[4],
    data.intervalDays != null ? normAmount(data.intervalDays) : existing[5],
    data.categories != null ? categoriesToCell(data.categories) : existing[6],
    data.startDate != null ? normDate(data.startDate) : existing[7],
    data.openingBalance != null ? normAmount(data.openingBalance) : existing[8],
    data.note != null ? data.note : existing[9],
    existing[10]
  ];
  sheet.getRange(rowIndex, 1, 1, ALLOCATION_HEADERS.length).setValues([updated]);
  return { success: true, data: allocationRowToObject(updated) };
}

/** Nothing references an envelope, so deleting one orphans no rows. */
function deleteAllocation(id) {
  var sheet = getSheetFor(ALLOCATIONS_SHEET, ALLOCATION_HEADERS);
  var rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) return { success: false, error: 'Allocation not found' };
  sheet.deleteRow(rowIndex);
  return { success: true };
}
```

- [ ] **Step 5: Register the tab and the actions**

In `listAll` (line 174), add a final entry:

```js
    savingContributions: readTab(CONTRIBUTIONS_SHEET, CONTRIBUTION_HEADERS, contributionRowToObject),
    allocations: readTab(ALLOCATIONS_SHEET, ALLOCATION_HEADERS, allocationRowToObject)
```

In `doPost`, after the `deleteContribution` route (line 659):

```js
    if (action === 'addAllocation') return jsonResponse(addAllocation(data));
    if (action === 'updateAllocation') return jsonResponse(updateAllocation(data));
    if (action === 'deleteAllocation') return jsonResponse(deleteAllocation(data.id));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run google-apps-script/Code.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 7: Commit**

```bash
git add google-apps-script/Code.gs google-apps-script/Code.test.ts
git commit -m "feat: add Allocations tab to the Apps Script API"
```

---

### Task 8: API client and local cache

**Files:**
- Modify: `src/api/sheetApi.ts`
- Modify: `src/offline/localCache.ts`

**Interfaces:**
- Consumes: `Allocation`, `normalizeAllocation` (Task 4); the Apps Script actions (Task 7).
- Produces, consumed by Task 9:
  - `sheetApi.AllocationFormData = Pick<Allocation, 'name' | 'icon' | 'amount' | 'cadence' | 'intervalDays' | 'categories' | 'startDate' | 'openingBalance' | 'note'>`
  - `sheetApi.addAllocation(form): Promise<Allocation>`
  - `sheetApi.updateAllocation(data: Partial<AllocationFormData> & { id: string }): Promise<Allocation>`
  - `sheetApi.deleteAllocation(id: string): Promise<void>`
  - `SheetSnapshot.allocations: Allocation[]`
  - `loadCachedAllocations(): Allocation[]`, `saveCachedAllocations(rows: Allocation[]): void`

- [ ] **Step 1: Extend the API client**

In `src/api/sheetApi.ts`:

1. Add `normalizeAllocation` to the import from `../utils/normalize`, and `Allocation` to the type import from `../types`.
2. Add `allocations: Allocation[];` to `SheetSnapshot` and `allocations?: unknown[];` to `RawSnapshot`.
3. In `fetchAll`'s returned object, add:

```ts
    allocations: (raw.allocations ?? []).map((r) => normalizeAllocation(r as Partial<Allocation>))
```

The `?? []` is what lets a deployment that predates this feature keep working — the user sees no envelopes rather than an error, exactly as `fetchAll` already tolerates a pre-accounts deployment.

4. Add the three calls after `deleteContribution`:

```ts
export type AllocationFormData = Pick<
  Allocation,
  'name' | 'icon' | 'amount' | 'cadence' | 'intervalDays' | 'categories' | 'startDate' | 'openingBalance'
> & { note?: string };

export async function addAllocation(form: AllocationFormData): Promise<Allocation> {
  return normalizeAllocation(await postAction<Allocation>('addAllocation', form));
}

export async function updateAllocation(
  data: Partial<AllocationFormData> & { id: string }
): Promise<Allocation> {
  return normalizeAllocation(await postAction<Allocation>('updateAllocation', data));
}

export async function deleteAllocation(id: string): Promise<void> {
  await postAction<null>('deleteAllocation', { id });
}
```

5. Add `'addAllocation' | 'updateAllocation' | 'deleteAllocation'` to the `action` union in `postAction`.

- [ ] **Step 2: Extend the local cache**

In `src/offline/localCache.ts`:

1. Add `Allocation` to the type import.
2. Add `const ALLOCATIONS_KEY = 'finance:allocations';` after `CONTRIBUTIONS_KEY`.
3. Add `let allocationsCache: Allocation[] | null = null;`
4. Add the accessor pair:

```ts
export function loadCachedAllocations(): Allocation[] {
  if (allocationsCache === null) {
    allocationsCache = readFromDisk<Allocation[]>(ALLOCATIONS_KEY, []);
  }
  return allocationsCache;
}

export function saveCachedAllocations(rows: Allocation[]): void {
  allocationsCache = rows;
  scheduleWrite(ALLOCATIONS_KEY, rows);
}
```

5. In `clearCache`, add `allocationsCache = [];` and add `ALLOCATIONS_KEY` to the `purge([...])` array. Missing this leaves one user's envelopes visible after switching to another sheet.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: clean. `useFinanceStore.ts` will not yet reference any of this, which is fine.

- [ ] **Step 4: Commit**

```bash
git add src/api/sheetApi.ts src/offline/localCache.ts
git commit -m "feat: add allocation API client and local cache"
```

---

### Task 9: Store wiring

**Files:**
- Modify: `src/hooks/useFinanceStore.ts`

**Interfaces:**
- Consumes: everything from Task 8.
- Produces, on the `FinanceStore` object returned by `useFinanceStore()`, consumed by Task 14:
  - `allocations: Allocation[]`
  - `addAllocation: (form: sheetApi.AllocationFormData) => Promise<Allocation>`
  - `updateAllocation: (id: string, form: Partial<sheetApi.AllocationFormData>) => Promise<void>`
  - `deleteAllocation: (id: string) => Promise<void>`

- [ ] **Step 1: Declare it on the interface**

In the `FinanceStore` interface, add `allocations: Allocation[];` after `savingContributions`, and the three methods after `deleteContribution`:

```ts
  addAllocation: (form: sheetApi.AllocationFormData) => Promise<Allocation>;
  updateAllocation: (id: string, form: Partial<sheetApi.AllocationFormData>) => Promise<void>;
  deleteAllocation: (id: string) => Promise<void>;
```

Add `Allocation` to the type import from `../types`, and `loadCachedAllocations` / `saveCachedAllocations` to the import from `../offline/localCache`.

- [ ] **Step 2: Add state, ref and persister**

After the `savingContributions` state:

```ts
  const [allocations, setAllocations] = useState<Allocation[]>(() => loadCachedAllocations());
```

After `contributionsRef.current = savingContributions;`:

```ts
  const allocationsRef = useRef(allocations);
  allocationsRef.current = allocations;
```

After `persistContributions`:

```ts
  const persistAllocations = useCallback((next: Allocation[]) => {
    setAllocations(next);
    saveCachedAllocations(next);
  }, []);
```

- [ ] **Step 3: Merge remote rows**

In `fetchAndMerge`, add the map alongside the others:

```ts
    const allocById = new Map(remote.allocations.map((a) => [a.id, a]));
```

Add `allocation: allocById as never,` to the `maps` record, add `persistAllocations([...allocById.values()]);` after `persistContributions(...)`, and add `persistAllocations` to the `useCallback` dependency array.

- [ ] **Step 4: Dispatch queued changes**

In `dispatch`, add this block after the `savingContribution` block (line 315) — it mirrors the `saving` block exactly:

```ts
      if (entry.entity === 'allocation') {
        if (entry.type === 'add') {
          const created = await sheetApi.addAllocation(
            entry.payload as sheetApi.AllocationFormData
          );
          persistAllocations(
            allocationsRef.current.map((a) => (a.id === entry.id ? created : a))
          );
        } else if (entry.type === 'update') {
          await sheetApi.updateAllocation({ id: entry.id, ...entry.payload });
          persistAllocations(
            allocationsRef.current.map((a) => (a.id === entry.id ? { ...a, _pending: false } : a))
          );
        } else if (!isLocalId(entry.id)) {
          await sheetApi.deleteAllocation(entry.id);
        }
        return;
      }
```

Add `persistAllocations` to `dispatch`'s dependency array.

- [ ] **Step 5: Add the mutations**

After `deleteContribution` (line 848):

```ts
  const addAllocation = useCallback(
    async (form: sheetApi.AllocationFormData): Promise<Allocation> => {
      const tempId = makeLocalId();
      const optimistic: Allocation = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persistAllocations([...allocationsRef.current, optimistic]);
      queueChange({ entity: 'allocation', type: 'add', id: tempId, payload: { ...form } });
      return optimistic;
    },
    [persistAllocations, queueChange]
  );

  const updateAllocation = useCallback(
    async (id: string, form: Partial<sheetApi.AllocationFormData>): Promise<void> => {
      persistAllocations(
        allocationsRef.current.map((a) => (a.id === id ? { ...a, ...form, _pending: true } : a))
      );

      const queue = loadQueue();
      const pendingAdd = queue.find(
        (e) => e.entity === 'allocation' && e.type === 'add' && e.id === id
      );
      if (pendingAdd) {
        pendingAdd.payload = { ...pendingAdd.payload, ...form };
        saveQueue(queue);
        if (navigator.onLine) runSync();
        return;
      }
      queueChange({ entity: 'allocation', type: 'update', id, payload: { ...form } });
    },
    [persistAllocations, queueChange, runSync]
  );

  /** Nothing references an envelope, so there is nothing to cascade. */
  const deleteAllocation = useCallback(
    async (id: string): Promise<void> => {
      persistAllocations(allocationsRef.current.filter((a) => a.id !== id));

      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some(
        (e) => e.entity === 'allocation' && e.type === 'add' && e.id === id
      );
      const kept = queue.filter((e) => !(e.entity === 'allocation' && e.id === id));
      if (!wasUnsyncedAdd) kept.push({ entity: 'allocation', type: 'delete', id, payload: null });
      saveQueue(kept);
      syncCounts();
      if (navigator.onLine) runSync();
    },
    [persistAllocations, syncCounts, runSync]
  );
```

- [ ] **Step 6: Return them**

In the returned object, after `deleteContribution`:

```ts
    allocations,
    addAllocation,
    updateAllocation,
    deleteAllocation,
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useFinanceStore.ts
git commit -m "feat: wire allocations into the finance store"
```

---

### Task 10: Translation strings

Doing every string in one pass keeps the English and Indonesian wording consistent; splitting it across the three UI tasks produces drift.

**Files:**
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces: the keys below, consumed by Tasks 11–15.

- [ ] **Step 1: Add the English keys**

In the `en` object, after the savings block (around line 106):

```ts
  // Allocations (envelope budgets)
  allocationStripLabel: 'Allocations',
  allocationEmptyCta: 'Set an allocation',
  allocationAddLabel: 'Add allocation',
  allocationAddTitle: 'New allocation',
  allocationEditTitle: 'Edit allocation',
  allocationLeft: '{amount} left',
  allocationOverdrawn: '{amount} over',
  allocationPeriodProgress: '{spent} of {amount}',
  allocationUnallocated: 'Unallocated',
  allocationFieldName: 'Name',
  allocationNamePlaceholder: 'Food',
  allocationFieldIcon: 'Icon',
  allocationIconPlaceholder: '🍜',
  allocationFieldAmount: 'Amount per period',
  allocationFieldCadence: 'Refills',
  allocationFieldInterval: 'Every how many days',
  allocationFieldCategories: 'Categories',
  allocationFieldStart: 'Starting from',
  allocationCadenceDaily: 'Daily',
  allocationCadenceWeekly: 'Weekly',
  allocationCadenceMonthly: 'Monthly',
  allocationCadenceDays: 'Every N days',
  allocationClaimedBy: 'Claimed by {name}',
  allocationNoCategories: 'Pick at least one category.',
  allocationPeriodToday: 'Today',
  allocationPeriodRange: '{start} – {end}',
  allocationGranted: 'Granted',
  allocationSpent: 'Spent',
  allocationRecentTitle: 'Recent spending',
  allocationRecentEmpty: 'Nothing spent yet.',
  allocationResetBtn: 'Reset rollover',
  allocationResetConfirm:
    'Reset the rollover? The accumulated balance is discarded and this envelope starts fresh today.',
  allocationDeleteConfirm: 'Delete this allocation?',
```

- [ ] **Step 2: Add the Indonesian keys**

In the `id` object (starts at line 267), in the matching position:

```ts
  // Alokasi (amplop anggaran)
  allocationStripLabel: 'Alokasi',
  allocationEmptyCta: 'Buat alokasi',
  allocationAddLabel: 'Tambah alokasi',
  allocationAddTitle: 'Alokasi baru',
  allocationEditTitle: 'Ubah alokasi',
  allocationLeft: 'sisa {amount}',
  allocationOverdrawn: 'lebih {amount}',
  allocationPeriodProgress: '{spent} dari {amount}',
  allocationUnallocated: 'Belum dialokasikan',
  allocationFieldName: 'Nama',
  allocationNamePlaceholder: 'Makan',
  allocationFieldIcon: 'Ikon',
  allocationIconPlaceholder: '🍜',
  allocationFieldAmount: 'Jumlah per periode',
  allocationFieldCadence: 'Diisi ulang',
  allocationFieldInterval: 'Setiap berapa hari',
  allocationFieldCategories: 'Kategori',
  allocationFieldStart: 'Mulai dari',
  allocationCadenceDaily: 'Harian',
  allocationCadenceWeekly: 'Mingguan',
  allocationCadenceMonthly: 'Bulanan',
  allocationCadenceDays: 'Setiap N hari',
  allocationClaimedBy: 'Dipakai {name}',
  allocationNoCategories: 'Pilih minimal satu kategori.',
  allocationPeriodToday: 'Hari ini',
  allocationPeriodRange: '{start} – {end}',
  allocationGranted: 'Diberikan',
  allocationSpent: 'Terpakai',
  allocationRecentTitle: 'Pengeluaran terakhir',
  allocationRecentEmpty: 'Belum ada pengeluaran.',
  allocationResetBtn: 'Reset simpanan',
  allocationResetConfirm:
    'Reset simpanan? Saldo yang terkumpul dihapus dan amplop ini mulai dari awal hari ini.',
  allocationDeleteConfirm: 'Hapus alokasi ini?',
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean. A key present in `en` but missing from `id` is a compile error, because `id` is annotated `Record<TranslationKey, string>` — so a pass here proves both objects match.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: add allocation translation strings"
```

---

### Task 11: `AllocationCard` and `AllocationsStrip`

**Files:**
- Create: `src/features/allocations/AllocationCard.tsx`
- Create: `src/features/allocations/AllocationCard.css`
- Create: `src/features/allocations/AllocationsStrip.tsx`
- Create: `src/features/allocations/AllocationsStrip.css`

**Interfaces:**
- Consumes: `AllocationRow`, `summarizeAllocations` (Task 6); the `allocation*` translation keys (Task 10).
- Produces:
  - `AllocationCard` with props `{ row: AllocationRow; onOpen: () => void }`
  - `AllocationsStrip` (default export) with props:

```ts
export interface AllocationsStripProps {
  allocations: Allocation[];
  transactions: Transaction[];
  todayISO: string;
  onOpen: (allocation: Allocation) => void;
  onAdd: () => void;
}
```

- [ ] **Step 1: Write the card**

Create `src/features/allocations/AllocationCard.tsx`:

```tsx
import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import type { AllocationRow } from './allocations';
import './AllocationCard.css';

interface AllocationCardProps {
  row: AllocationRow;
  onOpen: () => void;
}

/**
 * Leads with `available` - the pot actually accumulated - and shows this
 * period's progress underneath. Two different questions, both worth answering:
 * what is in the pot, and how today is going.
 */
function AllocationCard({ row: { allocation, summary }, onOpen }: AllocationCardProps) {
  const { t } = useI18n();

  // Guarded because a zero amount hand-typed into the sheet would otherwise
  // divide to Infinity and land in a width style.
  const fraction =
    allocation.amount > 0 ? Math.min(1, Math.max(0, summary.spentThisPeriod / allocation.amount)) : 0;

  return (
    <button
      type="button"
      className={`alloc-card ${summary.isOverdrawn ? 'alloc-card--over' : ''}`}
      onClick={onOpen}
    >
      <span className="alloc-card__head">
        {allocation.icon && <span aria-hidden="true">{allocation.icon}</span>}
        <span className="alloc-card__name">{allocation.name}</span>
      </span>

      <span className="alloc-card__amount">
        {summary.isOverdrawn
          ? t('allocationOverdrawn', { amount: formatIDR(Math.abs(summary.available)) })
          : t('allocationLeft', { amount: formatIDR(summary.available) })}
      </span>

      <span className="alloc-card__bar" aria-hidden="true">
        <span className="alloc-card__fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </span>

      <span className="alloc-card__meta">
        {t('allocationPeriodProgress', {
          spent: formatIDR(summary.spentThisPeriod),
          amount: formatIDR(allocation.amount)
        })}
      </span>
    </button>
  );
}

export default memo(AllocationCard);
```

- [ ] **Step 2: Style the card**

Create `src/features/allocations/AllocationCard.css`:

```css
/* Fixed width so the row scrolls as a strip rather than squeezing cards as
   more envelopes are added. */
.alloc-card {
  flex: 0 0 auto; width: 10.5rem; text-align: left;
  display: flex; flex-direction: column; gap: 0.35rem;
  padding: 0.75rem; border: 1px solid var(--line); border-radius: 14px;
  background: var(--surface); color: inherit;
}
.alloc-card__head { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; }
.alloc-card__name {
  color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.alloc-card__amount { font-size: 1rem; font-weight: 700; }
.alloc-card--over .alloc-card__amount { color: var(--expense); }
.alloc-card__bar {
  display: block; height: 4px; border-radius: 999px;
  background: var(--line); overflow: hidden;
}
.alloc-card__fill { display: block; height: 100%; background: var(--accent); }
.alloc-card--over .alloc-card__fill { background: var(--expense); }
.alloc-card__meta { font-size: 0.7rem; color: var(--muted); }
```

If `--expense` is not the token name used for the expense red, open `src/index.css` and use whichever token `.stat-card--expense` uses.

- [ ] **Step 3: Write the strip**

Create `src/features/allocations/AllocationsStrip.tsx`:

```tsx
import { memo, useMemo } from 'react';
import { useI18n } from '../../i18n/context';
import { summarizeAllocations } from './allocations';
import AllocationCard from './AllocationCard';
import type { Allocation, Transaction } from '../../types';
import './AllocationsStrip.css';

export interface AllocationsStripProps {
  allocations: Allocation[];
  transactions: Transaction[];
  todayISO: string;
  onOpen: (allocation: Allocation) => void;
  onAdd: () => void;
}

/**
 * Envelopes on the transactions page, one card each.
 *
 * Unlike SavingsStrip this never returns null. Savings can be created from the
 * Savings tab, but allocations have no tab, so this strip is the only entry
 * point and cannot hide when there is nothing yet - hence the empty-state row.
 */
function AllocationsStrip({
  allocations,
  transactions,
  todayISO,
  onOpen,
  onAdd
}: AllocationsStripProps) {
  const { t } = useI18n();
  const rows = useMemo(
    () => summarizeAllocations(allocations, transactions, todayISO),
    [allocations, transactions, todayISO]
  );

  if (allocations.length === 0) {
    return (
      <section className="alloc-strip" aria-label={t('allocationStripLabel')}>
        <button type="button" className="alloc-strip__cta" onClick={onAdd}>
          + {t('allocationEmptyCta')}
        </button>
      </section>
    );
  }

  return (
    <section className="alloc-strip" aria-label={t('allocationStripLabel')}>
      <div className="alloc-strip__head">
        <h2 className="alloc-strip__title">{t('allocationStripLabel')}</h2>
      </div>

      <div className="alloc-strip__scroll">
        <div className="alloc-strip__row">
          {rows.map((row) => (
            <AllocationCard
              key={row.allocation.id}
              row={row}
              onOpen={() => onOpen(row.allocation)}
            />
          ))}
          <button
            type="button"
            className="alloc-strip__add"
            onClick={onAdd}
            aria-label={t('allocationAddLabel')}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}

export default memo(AllocationsStrip);
```

- [ ] **Step 4: Style the strip**

Create `src/features/allocations/AllocationsStrip.css`:

```css
.alloc-strip { margin: 1rem 0; }
.alloc-strip__head {
  display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.5rem;
}
.alloc-strip__title { margin: 0; font-size: 0.85rem; color: var(--muted); font-weight: 600; }

/* Negative margins let the row bleed to the screen edge while the page keeps
   its padding, so a card can sit half-visible and signal that it scrolls. */
.alloc-strip__scroll {
  overflow-x: auto; margin: 0 -1rem; padding: 0 1rem;
  scrollbar-width: none; -webkit-overflow-scrolling: touch;
}
.alloc-strip__scroll::-webkit-scrollbar { display: none; }
.alloc-strip__row { display: flex; gap: 0.6rem; }

.alloc-strip__add {
  flex: 0 0 auto; width: 3rem; min-height: 44px;
  border: 1px dashed var(--line); border-radius: 14px;
  background: transparent; color: var(--muted); font-size: 1.25rem;
}

.alloc-strip__cta {
  display: block; width: 100%; padding: 0.75rem; min-height: 44px;
  border: 1px dashed var(--line); border-radius: 14px;
  background: transparent; color: var(--muted); font-size: 0.85rem;
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean. Nothing renders these yet — Task 14 mounts them.

- [ ] **Step 6: Commit**

```bash
git add src/features/allocations/AllocationCard.tsx src/features/allocations/AllocationCard.css src/features/allocations/AllocationsStrip.tsx src/features/allocations/AllocationsStrip.css
git commit -m "feat: add allocation card and strip"
```

---

### Task 12: `AllocationForm`

**Files:**
- Create: `src/features/allocations/AllocationForm.tsx`

**Interfaces:**
- Consumes: `AllocationFormData` (Task 8); `EXPENSE_CATEGORIES` from `src/config/categories.ts`; `resolveClaims` (Task 6).
- Produces: `AllocationForm` (default export):

```ts
interface AllocationFormProps {
  /** Every envelope, so the form can grey out categories already claimed. */
  allocations: Allocation[];
  /** Every transaction, so categories in use but not preset are offered. */
  transactions: Transaction[];
  todayISO: string;
  onSubmit: (form: AllocationFormData) => Promise<void> | void;
  submitting: boolean;
  initialValue?: Allocation;
  onCancel: () => void;
  onDelete?: () => void;
}
```

- [ ] **Step 1: Write the form**

Create `src/features/allocations/AllocationForm.tsx`:

```tsx
import { memo, useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR, parseAmount } from '../../utils/money';
import { EXPENSE_CATEGORIES } from '../../config/categories';
import { resolveClaims } from './allocations';
import type { Allocation, AllocationCadence, Transaction } from '../../types';
import type { AllocationFormData } from '../../api/sheetApi';

interface AllocationFormProps {
  allocations: Allocation[];
  transactions: Transaction[];
  todayISO: string;
  onSubmit: (form: AllocationFormData) => Promise<void> | void;
  submitting: boolean;
  initialValue?: Allocation;
  onCancel: () => void;
  onDelete?: () => void;
}

const CADENCES: AllocationCadence[] = ['daily', 'weekly', 'monthly', 'days'];

const CADENCE_KEYS = {
  daily: 'allocationCadenceDaily',
  weekly: 'allocationCadenceWeekly',
  monthly: 'allocationCadenceMonthly',
  days: 'allocationCadenceDays'
} as const;

function AllocationForm({
  allocations,
  transactions,
  todayISO,
  onSubmit,
  submitting,
  initialValue,
  onCancel,
  onDelete
}: AllocationFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [icon, setIcon] = useState(initialValue?.icon ?? '');
  const [amountText, setAmountText] = useState(
    initialValue ? formatIDR(initialValue.amount).replace('Rp ', '') : ''
  );
  const [cadence, setCadence] = useState<AllocationCadence>(initialValue?.cadence ?? 'daily');
  const [intervalDays, setIntervalDays] = useState(String(initialValue?.intervalDays ?? 7));
  const [picked, setPicked] = useState<string[]>(initialValue?.categories ?? []);
  const [startDate, setStartDate] = useState(initialValue?.startDate ?? todayISO);
  const [note, setNote] = useState(initialValue?.note ?? '');

  const amount = parseAmount(amountText);

  // The presets plus anything the user has actually spent on, so a category
  // typed freehand into the transaction form can still be budgeted.
  const options = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const txn of transactions) {
      if (txn.type !== 'expense') continue;
      const category = txn.category.trim();
      if (category !== '') set.add(category);
    }
    for (const category of picked) set.add(category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [transactions, picked]);

  /** Category to the name of the envelope already claiming it, excluding this one. */
  const claimedBy = useMemo(() => {
    const owned = resolveClaims(allocations);
    const byCategory = new Map<string, string>();
    for (const allocation of allocations) {
      if (allocation.id === initialValue?.id) continue;
      for (const category of owned.get(allocation.id) ?? []) {
        byCategory.set(category, allocation.name);
      }
    }
    return byCategory;
  }, [allocations, initialValue?.id]);

  function toggle(category: string) {
    setPicked((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || amount <= 0 || picked.length === 0) return;

    const interval = Number.parseInt(intervalDays, 10);
    await onSubmit({
      name: name.trim(),
      icon: icon.trim(),
      amount,
      cadence,
      intervalDays: cadence === 'days' && interval >= 1 ? interval : 1,
      categories: picked,
      // On edit this is ignored by the caller, which rebases instead.
      startDate: isEditing ? initialValue!.startDate : startDate,
      openingBalance: initialValue?.openingBalance ?? 0,
      note: note.trim()
    });
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('allocationFieldName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('allocationNamePlaceholder')}
          autoFocus={!isEditing}
          required
        />
      </label>

      <label>
        {t('allocationFieldIcon')}
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder={t('allocationIconPlaceholder')}
          maxLength={4}
        />
      </label>

      <label className="txn-form__amount">
        {t('allocationFieldAmount')}
        <div className="amount-input">
          <span className="amount-input__prefix">Rp</span>
          <input
            inputMode="numeric"
            value={amountText}
            onChange={(e) => {
              const parsed = parseAmount(e.target.value);
              setAmountText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
            }}
            placeholder={t('amountPlaceholder')}
            required
          />
        </div>
      </label>

      <label>
        {t('allocationFieldCadence')}
        <select value={cadence} onChange={(e) => setCadence(e.target.value as AllocationCadence)}>
          {CADENCES.map((c) => (
            <option key={c} value={c}>
              {t(CADENCE_KEYS[c])}
            </option>
          ))}
        </select>
      </label>

      {cadence === 'days' && (
        <label>
          {t('allocationFieldInterval')}
          <input
            inputMode="numeric"
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, ''))}
            required
          />
        </label>
      )}

      <fieldset className="alloc-form__categories">
        <legend>{t('allocationFieldCategories')}</legend>
        <div className="alloc-form__chips">
          {options.map((category) => {
            const owner = claimedBy.get(category);
            return (
              <button
                key={category}
                type="button"
                className={`chip ${picked.includes(category) ? 'chip--active' : ''}`}
                disabled={owner !== undefined}
                title={owner ? t('allocationClaimedBy', { name: owner }) : undefined}
                onClick={() => toggle(category)}
              >
                {category}
              </button>
            );
          })}
        </div>
        {picked.length === 0 && (
          <p className="alloc-form__hint">{t('allocationNoCategories')}</p>
        )}
      </fieldset>

      {/* Only when creating: on edit the caller rebases, which moves this date,
          so offering the field would be a lie. */}
      {!isEditing && (
        <label>
          {t('allocationFieldStart')}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </label>
      )}

      <label>
        {t('fieldNote')}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('notePlaceholder')}
        />
      </label>

      <div className="form-actions">
        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting ? t('savingBtn') : isEditing ? t('updateBtn') : t('saveBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={submitting}>
          {t('cancelBtn')}
        </button>
        {isEditing && onDelete && (
          <button className="btn btn--danger" type="button" onClick={onDelete} disabled={submitting}>
            {t('deleteBtn')}
          </button>
        )}
      </div>
    </form>
  );
}

export default memo(AllocationForm);
```

- [ ] **Step 2: Add the category-picker styles**

Append to `src/styles/forms.css`:

```css
/* Category picker inside the allocation form. */
.alloc-form__categories { border: none; padding: 0; margin: 0; }
.alloc-form__categories legend { font-size: 0.85rem; color: var(--muted); padding: 0 0 0.4rem; }
.alloc-form__chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.alloc-form__chips .chip:disabled { opacity: 0.4; }
.alloc-form__hint { margin: 0.4rem 0 0; font-size: 0.75rem; color: var(--muted); }
```

If `.chip` / `.chip--active` are not the class names `CategoryFilter.css` uses, open it and reuse whatever it defines rather than inventing a parallel set.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/allocations/AllocationForm.tsx src/styles/forms.css
git commit -m "feat: add allocation form"
```

---

### Task 13: `AllocationDetail`

**Files:**
- Create: `src/features/allocations/AllocationDetail.tsx`
- Create: `src/features/allocations/AllocationDetail.css`

**Interfaces:**
- Consumes: `summarizeAllocations`, `resolveClaims` (Task 6).
- Produces: `AllocationDetail` (default export):

```ts
interface AllocationDetailProps {
  allocation: Allocation;
  allocations: Allocation[];
  transactions: Transaction[];
  todayISO: string;
  submitting: boolean;
  onEdit: () => void;
  onReset: () => void;
  onClose: () => void;
}
```

- [ ] **Step 1: Write the detail panel**

Create `src/features/allocations/AllocationDetail.tsx`:

```tsx
import { memo, useMemo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import { resolveClaims, summarizeAllocations } from './allocations';
import { shortDate } from '../transactions/dateGroups';
import type { Allocation, Transaction } from '../../types';
import './AllocationDetail.css';

interface AllocationDetailProps {
  allocation: Allocation;
  allocations: Allocation[];
  transactions: Transaction[];
  todayISO: string;
  submitting: boolean;
  onEdit: () => void;
  onReset: () => void;
  onClose: () => void;
}

const RECENT_LIMIT = 10;

function AllocationDetail({
  allocation,
  allocations,
  transactions,
  todayISO,
  submitting,
  onEdit,
  onReset,
  onClose
}: AllocationDetailProps) {
  const { t, locale } = useI18n();

  const summary = useMemo(() => {
    const rows = summarizeAllocations(allocations, transactions, todayISO);
    const found = rows.find((r) => r.allocation.id === allocation.id);
    return found!.summary;
  }, [allocations, transactions, todayISO, allocation.id]);

  const owned = useMemo(
    () => resolveClaims(allocations).get(allocation.id) ?? [],
    [allocations, allocation.id]
  );

  /** What actually drew the envelope down, newest first. */
  const recent = useMemo(() => {
    const claimed = new Set(owned);
    return transactions
      .filter(
        (txn) =>
          txn.type === 'expense' &&
          claimed.has(txn.category.trim()) &&
          txn.date >= allocation.startDate &&
          txn.date <= todayISO
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_LIMIT);
  }, [transactions, owned, allocation.startDate, todayISO]);

  const periodLabel =
    summary.periodStart === summary.periodEnd
      ? summary.periodStart === todayISO
        ? t('allocationPeriodToday')
        : shortDate(summary.periodStart, locale)
      : t('allocationPeriodRange', {
          start: shortDate(summary.periodStart, locale),
          end: shortDate(summary.periodEnd, locale)
        });

  return (
    <div className="alloc-detail">
      <h2 className="modal__title">
        {allocation.icon ? `${allocation.icon} ` : ''}
        {allocation.name}
      </h2>

      <p className={`alloc-detail__amount ${summary.isOverdrawn ? 'alloc-detail__amount--over' : ''}`}>
        {summary.isOverdrawn
          ? t('allocationOverdrawn', { amount: formatIDR(Math.abs(summary.available)) })
          : t('allocationLeft', { amount: formatIDR(summary.available) })}
      </p>

      <p className="alloc-detail__period">{periodLabel}</p>

      <dl className="alloc-detail__figures">
        <div>
          <dt>{t('allocationGranted')}</dt>
          <dd>{formatIDR(summary.granted)}</dd>
        </div>
        <div>
          <dt>{t('allocationSpent')}</dt>
          <dd>{formatIDR(summary.spent)}</dd>
        </div>
      </dl>

      <p className="alloc-detail__progress">
        {t('allocationPeriodProgress', {
          spent: formatIDR(summary.spentThisPeriod),
          amount: formatIDR(allocation.amount)
        })}
      </p>

      <div className="alloc-detail__chips">
        {owned.map((category) => (
          <span key={category} className="chip">
            {category}
          </span>
        ))}
      </div>

      <h3 className="alloc-detail__subtitle">{t('allocationRecentTitle')}</h3>
      {recent.length === 0 ? (
        <p className="alloc-detail__empty">{t('allocationRecentEmpty')}</p>
      ) : (
        <ul className="alloc-detail__list">
          {recent.map((txn) => (
            <li key={txn.id}>
              <span className="alloc-detail__list-date">{shortDate(txn.date, locale)}</span>
              <span className="alloc-detail__list-category">{txn.category}</span>
              <span className="alloc-detail__list-amount">{formatIDR(txn.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button className="btn btn--primary" type="button" onClick={onEdit} disabled={submitting}>
          {t('editTitle')}
        </button>
        {/* Grouped with Edit, not Delete: this adjusts an envelope the user
            intends to keep using. */}
        <button className="btn btn--secondary" type="button" onClick={onReset} disabled={submitting}>
          {t('allocationResetBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onClose} disabled={submitting}>
          {t('closeBtn')}
        </button>
      </div>
    </div>
  );
}

export default memo(AllocationDetail);
```

Before running, confirm `shortDate(date, locale)` is exported from `src/features/transactions/dateGroups.ts` — `TransactionList.tsx:3` imports it, so it is. Confirm the `editTitle` and `closeBtn` keys exist in `translations.ts`; `AppShell.tsx:741` and `:533` use them, so they do.

- [ ] **Step 2: Style it**

Create `src/features/allocations/AllocationDetail.css`:

```css
.alloc-detail__amount { margin: 0.25rem 0 0; font-size: 1.6rem; font-weight: 700; }
.alloc-detail__amount--over { color: var(--expense); }
.alloc-detail__period { margin: 0.1rem 0 0.9rem; font-size: 0.8rem; color: var(--muted); }

.alloc-detail__figures { display: flex; gap: 1.5rem; margin: 0 0 0.75rem; }
.alloc-detail__figures dt { font-size: 0.72rem; color: var(--muted); }
.alloc-detail__figures dd { margin: 0.1rem 0 0; font-size: 0.95rem; font-weight: 600; }

.alloc-detail__progress { margin: 0 0 0.9rem; font-size: 0.8rem; color: var(--muted); }
.alloc-detail__chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1rem; }

.alloc-detail__subtitle { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--muted); }
.alloc-detail__empty { margin: 0 0 1rem; font-size: 0.8rem; color: var(--muted); }

.alloc-detail__list { list-style: none; margin: 0 0 1rem; padding: 0; }
.alloc-detail__list li {
  display: flex; align-items: baseline; gap: 0.6rem;
  padding: 0.4rem 0; border-bottom: 1px solid var(--line); font-size: 0.82rem;
}
.alloc-detail__list-date { color: var(--muted); flex: 0 0 auto; }
.alloc-detail__list-category {
  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.alloc-detail__list-amount { flex: 0 0 auto; font-weight: 600; }
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/allocations/AllocationDetail.tsx src/features/allocations/AllocationDetail.css
git commit -m "feat: add allocation detail panel"
```

---

### Task 14: Mount allocations in `AppShell` and `TransactionsScreen`

**Files:**
- Modify: `src/AppShell.tsx`
- Modify: `src/features/transactions/TransactionsScreen.tsx`

**Interfaces:**
- Consumes: the store methods (Task 9), `AllocationsStrip` (Task 11), `AllocationForm` (Task 12), `AllocationDetail` (Task 13), `rebase` / `resetRollover` / `needsRebase` (Task 6).
- Produces: three new props on `TransactionsScreenProps` — `allocations: Allocation[]`, `onOpenAllocation: (a: Allocation) => void`, `onAddAllocation: () => void`.

- [ ] **Step 1: Render the strip**

In `src/features/transactions/TransactionsScreen.tsx`:

1. Add `import AllocationsStrip from '../allocations/AllocationsStrip';` and `Allocation` to the type import.
2. Add to `TransactionsScreenProps`:

```ts
  allocations: Allocation[];
  onOpenAllocation: (allocation: Allocation) => void;
  onAddAllocation: () => void;
```

3. Destructure them in the component signature.
4. Insert between `<Summary … />` and `<SavingsStrip … />` — envelopes sit above savings goals because "what can I spend today" is the question the app is opened to answer:

```tsx
      <AllocationsStrip
        allocations={allocations}
        transactions={transactions}
        todayISO={todayISO}
        onOpen={onOpenAllocation}
        onAdd={onAddAllocation}
      />
```

- [ ] **Step 2: Add the lazy imports and state to `AppShell`**

In `src/AppShell.tsx`, alongside the other `lazy()` declarations (lines 38–48):

```tsx
const AllocationForm = lazy(() => import('./features/allocations/AllocationForm'));
const AllocationDetail = lazy(() => import('./features/allocations/AllocationDetail'));
```

Add the editor type next to the others (near line 68):

```tsx
/** And for allocations. */
type AllocationEditor = null | 'new' | Allocation;
```

Add `Allocation` to the type import from `./types`, pull the new store values out of `useFinanceStore()`:

```tsx
    allocations,
    addAllocation,
    updateAllocation,
    deleteAllocation,
```

and add the state:

```tsx
  const [allocationEditor, setAllocationEditor] = useState<AllocationEditor>(null);
  const [openAllocationId, setOpenAllocationId] = useState<string | null>(null);
```

Add the lookup next to `openDebt` / `openSaving` (line 253):

```tsx
  const openAllocation = allocations.find((a) => a.id === openAllocationId) ?? null;
```

- [ ] **Step 3: Add the handlers**

Add near the other submit handlers, plus the imports
`import { needsRebase, rebase, resetRollover } from './features/allocations/allocations';`:

```tsx
  /**
   * Amount, cadence, interval and categories all feed the rollover computed
   * from startDate, so changing any of them would rewrite every past period.
   * Rebasing instead snapshots what the envelope holds now and restarts the
   * clock - see the design doc's "Rebase on edit".
   */
  const handleAllocationSubmit = useCallback(
    async (form: Parameters<typeof addAllocation>[0]) => {
      setSubmitting(true);
      try {
        if (allocationEditor && allocationEditor !== 'new') {
          const patch = needsRebase(allocationEditor, form)
            ? { ...form, ...rebase(allocationEditor, allocations, transactions, today) }
            : form;
          await updateAllocation(allocationEditor.id, patch);
        } else {
          await addAllocation(form);
        }
        setAllocationEditor(null);
      } finally {
        setSubmitting(false);
      }
    },
    [allocationEditor, allocations, transactions, today, addAllocation, updateAllocation]
  );

  const handleAllocationDelete = useCallback(async () => {
    if (!allocationEditor || allocationEditor === 'new') return;
    if (!confirm(t('allocationDeleteConfirm'))) return;
    setSubmitting(true);
    try {
      await deleteAllocation(allocationEditor.id);
      setAllocationEditor(null);
      setOpenAllocationId(null);
    } finally {
      setSubmitting(false);
    }
  }, [allocationEditor, deleteAllocation, t]);

  const handleAllocationReset = useCallback(async () => {
    if (!openAllocation) return;
    if (!confirm(t('allocationResetConfirm'))) return;
    setSubmitting(true);
    try {
      await updateAllocation(openAllocation.id, resetRollover(today));
    } finally {
      setSubmitting(false);
    }
  }, [openAllocation, updateAllocation, today, t]);
```

- [ ] **Step 4: Pass the new props to the screen**

Extend the `<TransactionsScreen … />` usage added in Task 2:

```tsx
  allocations={allocations}
  onOpenAllocation={(allocation) => setOpenAllocationId(allocation.id)}
  onAddAllocation={() => setAllocationEditor('new')}
```

- [ ] **Step 5: Add the two modals**

Add alongside the other modals, following the exact structure of the saving modals at `AppShell.tsx:540-598`:

```tsx
      {openAllocation && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={openAllocation.name}>
          <div className="modal__backdrop" onClick={() => !submitting && setOpenAllocationId(null)} />
          <div className="modal__panel modal__panel--wide">
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <AllocationDetail
                allocation={openAllocation}
                allocations={allocations}
                transactions={transactions}
                todayISO={today}
                submitting={submitting}
                onEdit={() => setAllocationEditor(openAllocation)}
                onReset={handleAllocationReset}
                onClose={() => setOpenAllocationId(null)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {allocationEditor !== null && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={
            allocationEditor === 'new' ? t('allocationAddTitle') : t('allocationEditTitle')
          }
        >
          <div className="modal__backdrop" onClick={() => !submitting && setAllocationEditor(null)} />
          <div className="modal__panel">
            <h2 className="modal__title">
              {allocationEditor === 'new' ? t('allocationAddTitle') : t('allocationEditTitle')}
            </h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <AllocationForm
                key={allocationEditor === 'new' ? 'new' : allocationEditor.id}
                allocations={allocations}
                transactions={transactions}
                todayISO={today}
                onSubmit={handleAllocationSubmit}
                submitting={submitting}
                initialValue={allocationEditor === 'new' ? undefined : allocationEditor}
                onCancel={() => setAllocationEditor(null)}
                onDelete={allocationEditor !== 'new' ? handleAllocationDelete : undefined}
              />
            </Suspense>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: clean.

- [ ] **Step 7: Verify in the browser**

Run `pnpm dev` and walk the whole feature:

1. With no envelopes, the transactions screen shows the "Set an allocation" row. Tap it; the form opens.
2. Create a daily Rp 50.000 Food envelope starting today. The card appears showing Rp 50.000 left.
3. Add a Rp 20.000 Food expense dated today. The card drops to Rp 30.000 left and the progress reads "Rp 20.000 of Rp 50.000".
4. Add a Rp 20.000 Transport expense. The card does not move.
5. Create a second envelope and confirm Food is greyed out in its category picker, with the owner named on hover.
6. Open the detail modal: the period reads "Today", granted and spent are right, and the recent list shows the Food expense.
7. Edit the envelope's amount to Rp 60.000. Reopen it — the balance should be the pre-edit available plus one day at the new rate, **not** a retroactively recomputed figure.
8. Tap Reset rollover and confirm. Available becomes Rp 60.000 minus today's spending in claimed categories.
9. Go offline (DevTools → Network → Offline), create an envelope, confirm it appears with a pending marker and the pending count rises. Go back online and confirm it syncs.
10. Delete an envelope and confirm it disappears and does not return after a refresh.

- [ ] **Step 8: Commit**

```bash
git add src/AppShell.tsx src/features/transactions/TransactionsScreen.tsx
git commit -m "feat: mount allocations on the transactions screen"
```

---

### Task 15: Unallocated line on the Summary card

**Files:**
- Modify: `src/features/transactions/Summary.tsx`
- Modify: `src/features/transactions/Summary.css`
- Modify: `src/features/transactions/TransactionsScreen.tsx`

**Interfaces:**
- Consumes: `summarizeAllocations`, `unallocated` (Task 6).
- Produces: a new optional `unallocated` prop on `Summary`.

- [ ] **Step 1: Add the prop**

In `src/features/transactions/Summary.tsx`, add to `SummaryProps`:

```ts
  /** Null when no envelopes exist; the line is then not rendered at all. */
  unallocated: number | null;
```

Destructure it, and render after the `debt` card block, before `</section>`:

```tsx
      {/* Balance minus what the envelopes still hold. Goes negative when they
          promise more than is held, which is the warning worth having. */}
      {unallocated !== null && (
        <p className={`summary__unallocated ${unallocated < 0 ? 'summary__unallocated--over' : ''}`}>
          <span>{t('allocationUnallocated')}</span>
          <span>{formatIDR(unallocated)}</span>
        </p>
      )}
```

- [ ] **Step 2: Style it**

Append to `src/features/transactions/Summary.css`:

```css
.summary__unallocated {
  display: flex; justify-content: space-between; align-items: baseline;
  margin: 0.6rem 0 0; font-size: 0.8rem; color: var(--muted);
}
.summary__unallocated span:last-child { font-weight: 600; }
.summary__unallocated--over span:last-child { color: var(--expense); }
```

- [ ] **Step 3: Compute and pass it**

In `TransactionsScreen.tsx`, add `import { summarizeAllocations, unallocated as computeUnallocated } from '../allocations/allocations';` and:

```tsx
  // Null when there are no envelopes, so a user not using the feature sees the
  // Summary card exactly as it was.
  const unallocatedAmount = useMemo(() => {
    if (allocations.length === 0) return null;
    const rows = summarizeAllocations(allocations, transactions, todayISO);
    return computeUnallocated(balance, rows);
  }, [allocations, transactions, todayISO, balance]);
```

Pass `unallocated={unallocatedAmount}` to `<Summary … />`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

With no envelopes, the Summary card is unchanged. With one Rp 50.000 daily envelope, "Unallocated" reads balance minus the envelope's available. Create an envelope whose available exceeds the balance and confirm the figure goes negative and turns red. Overspend an envelope and confirm unallocated returns to the full balance — an overdrawn envelope holds nothing.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/Summary.tsx src/features/transactions/Summary.css src/features/transactions/TransactionsScreen.tsx
git commit -m "feat: show unallocated balance on the summary card"
```

---

### Task 16: Document the Allocations tab and verify the whole feature

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the sheet tab**

In `README.md`, in the "Sheet Format" section, change "Six more tabs are created automatically" to "Seven more tabs are created automatically", and add after the `SavingContributions` line:

```markdown
**Allocations** — `id`, `name`, `icon`, `amount`, `cadence`, `intervalDays`, `categories`, `startDate`, `openingBalance`, `note`, `createdAt`
```

Then add a paragraph after the `DebtInstalments` note:

```markdown
`Allocations` holds envelope budgets. `cadence` is one of `daily`, `weekly`,
`monthly` or `days`; `intervalDays` applies only to `days`. `categories` is a
JSON array of the categories the envelope claims, though a comma-separated list
is read too if you edit the cell by hand. `startDate` and `openingBalance`
together carry the rollover: editing an envelope's amount, cadence or categories
rebases them to today rather than retroactively rewriting past periods, so those
two cells change on their own and are not worth editing directly.
```

- [ ] **Step 2: Add it to the feature list**

In the "Features" section of `README.md`, add:

```markdown
- **Envelope budgets**: daily, weekly, monthly or custom allocations per category, with rollover
```

- [ ] **Step 3: Full verification**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: no type errors, every test passing, a successful build.

- [ ] **Step 4: Verify against a real sheet**

Paste the updated `google-apps-script/Code.gs` into the Apps Script editor, redeploy, and confirm in the running app that an envelope created on the device appears as a row in the `Allocations` tab, and that a change made in the sheet appears in the app after a pull-to-refresh.

Also confirm the degrade path: before redeploying, the app should show no envelopes rather than an error, and a write attempt should land in the failed-changes list with the script's own message.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the Allocations tab"
```

---

## Notes for the implementer

**Why the maths lives in `.ts` files and the components stay dumb.** `vitest.config.ts` collects `src/**/*.test.ts` — not `.tsx` — and the project has no component-testing library. Putting a calculation inside a component makes it permanently untestable here. If you find yourself wanting to test something in a `.tsx` file, that is a signal the logic belongs in `allocations.ts` or `pagination.ts`.

**Do not "fix" the retroactive-rollover behaviour.** Rebasing on edit is deliberate and the reasoning is in the spec: recomputing history when the amount changes silently invents rollover that never existed.

**Do not add allocations to the backup format.** `importBackup` covers transactions, accounts and transfers only; debts and savings are already absent. Adding one of the three missing entities is out of scope and is called out as such in the spec.
