# Period and Category Filters — Design

Date: 2026-08-01

## Problem

The transaction list can only be narrowed one way: tapping a heatmap cell to
pick a single day. There is no way to look at a category on its own, and the
income/expense figures in the summary are hardcoded to the current month.

Users want two things:

1. Browse transactions by category, with expense and income categories
   distinguishable.
2. See income and expense for the previous month, the current month, or a
   specific date.

## Approach

One **period** drives the whole screen, and a **category filter** narrows within
it. Both live in `AppShell`, which owns a single filter pipeline that Summary,
the category chips, and the list all read from. The heatmap becomes the
navigation control for picking a date rather than a second, competing filter.

```
transactions
  ├─ computeBalance ────────────────────────→ Summary.balance  (all-time)
  └─ filterByPeriod(period) → periodScoped
        ├─ computeTotals ─────────────────→ Summary.income / expense
        ├─ deriveCategories ──────────────→ CategoryFilter chips
        └─ applyCategoryFilter(chip) ─────→ TransactionList
```

## Period

```ts
type Period =
  | { kind: 'month'; key: string }   // 'YYYY-MM'
  | { kind: 'date';  date: string }  // 'YYYY-MM-DD'
```

New module `src/utils/period.ts`:

- `currentMonth(todayISO): Period`
- `previousMonth(todayISO): Period`
- `filterByPeriod(txns, period): Transaction[]`

Month arithmetic operates on the `YYYY-MM` string, not `Date`, so the
January → December year rollover is explicit and there is no timezone exposure.
This matches how `summary.ts` already derives its month key.

The default period is the current month.

### Picking a period

`PeriodBar` renders `[Last month] [This month] [date input]`. When the period is
a specific date, a fourth chip appears showing that date with a `×` to dismiss
it back to the current month. The date input is a native `<input type="date">`,
so any date is reachable — including dates older than the heatmap's 26-week
window.

Tapping a heatmap cell sets the period to that date, even when the cell falls
outside the currently selected month. The heatmap is the navigator; the tap
wins.

## Category filter

New module `src/utils/categoryFilter.ts`:

```ts
interface CategoryChip { category: string; type: TransactionType }
```

- `deriveCategories(txns): CategoryChip[]`
- `applyCategoryFilter(txns, chip: CategoryChip | null): Transaction[]`

A chip is a `(category, type)` pair rather than a bare string. `Gift` can
legitimately exist as both an expense and an income, and the grouped chip row
needs to show them separately; filtering therefore matches on both fields.

Chips are derived from the period-scoped transactions, so the row reflects only
what is actually present in the current view. Ordering is expense group first,
then income group, alphabetical within each group. Transactions with a blank
category — the form permits one — collapse into a single "Uncategorized" chip
per type so they stay reachable.

`CategoryFilter` renders a horizontally scrollable row: an `All` chip, the
expense chips, a divider, then the income chips.

### Reconciliation

Changing the period can remove the selected chip from the row, which would
leave the list filtered by something no longer visible. Every period change
funnels through a single `setPeriod` wrapper in `AppShell` that clears the
category selection back to `All` when the selected chip is absent from the new
scope. Three call sites — period bar, heatmap cell, date input — reconcile at
one point rather than three, and synchronously rather than in an effect.

## Component changes

**`Summary.tsx`** becomes presentational: `{ balance, income, expense, period }`.
It no longer computes anything. The ↑/↓ labels stay "Income" and "Expense", with
the period name rendered once as a subtitle above them — one translated string
per period instead of a labelled variant per row.

**`summary.ts`** replaces `computeMonthTotals(txns, refISODate)` with
`computeTotals(txns)`; period filtering has already happened upstream.
`computeBalance` is unchanged.

**Balance stays all-time.** It is a balance; scoping it to a period would make
it a different number wearing the same label.

**`SpendingHeatmap.tsx`** keeps its full 26-week history. Its shading
percentiles need the whole range to be meaningful, and it is the navigation
control rather than a view of the period. It receives `selectedDate` derived
from the period (`kind === 'date' ? date : null`).

**`TransactionList.tsx`** loses its internal date filter and its `selectedDate`
prop, and renders whatever it is given.

## Empty states

- No transactions at all → `emptyTransactions` (existing).
- Period is a date with nothing in it → `emptyDayFiltered` (existing).
- Period is a month with nothing in it → `emptyPeriodFiltered` (new).
- Period has transactions but the category filter excludes them all →
  `emptyCategoryFiltered` (new).

## Tests

- `period.test.ts` — month key arithmetic including the January → December year
  rollover, month vs date filtering, empty input.
- `categoryFilter.test.ts` — dedup, the same name under both types, ordering,
  blank categories, empty input, filter application.
- `summary.test.ts` — updated for the `computeMonthTotals` → `computeTotals`
  split.

## i18n

New keys in both `en` and `id`: `periodLastMonth`, `periodThisMonth`,
`periodPickDate`, `periodClearDate`, `periodBarLabel`, `filterAllLabel`,
`uncategorized`, `categoryFilterLabel`, `emptyPeriodFiltered`,
`emptyCategoryFiltered`. `monthIncomeLabel` / `monthExpenseLabel` are replaced
by `incomeLabel` / `expenseLabel` now that the period is named separately.

## Out of scope

Per-category totals, percentages, or a breakdown chart. That is a separate
feature.
