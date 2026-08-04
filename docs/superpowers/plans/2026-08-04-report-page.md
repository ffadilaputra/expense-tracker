# Report Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Report screen, reached from a fifth bottom-nav tab, that scopes to a year, month or single day and shows totals, a trend chart, a category breakdown and a category table — with an Export PDF action producing a paginated document of that summary plus the underlying transactions.

**Architecture:** `utils/period.ts` gains a `year` variant so `filterByPeriod` stays the single place that decides what is in view. A pure `buildReport()` turns transactions + period into a `ReportData` value; the screen and the PDF builder both consume that same value, so they cannot disagree about a number. jsPDF is imported dynamically inside the export handler and draws both charts with vector primitives.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (jsdom), jsPDF. No router — screens switch on `AppShell`'s `tab` state.

**Spec:** `docs/superpowers/specs/2026-08-04-report-page-design.md`

## Global Constraints

- **Package manager is `pnpm`.** Never `npm` or `yarn`.
- **Vitest only collects `src/**/*.test.ts`** (see `vitest.config.ts`) — *not* `.test.tsx`. There are no component render tests in this repo. All logic that deserves a test lives in a plain `.ts` module; `.tsx` files stay thin and are verified by `pnpm typecheck` plus a manual pass.
- **Every user-facing string goes through `t()`.** Add each key to *both* `en` and `id` in `src/i18n/translations.ts`. The `Record<TranslationKey, string>` annotation on `id` makes a missing translation a compile error.
- **Money is formatted only by `formatIDR()`** from `src/utils/money.ts`. Never hand-format an amount.
- **Colours come from CSS custom properties**, never hardcoded hex in components: `--cat-0`…`--cat-5`, `--cat-other`, `--income` (`#157f3b`), `--expense` (`#b23b3b`), `--muted`, `--line`, `--text`.
- **Comments explain *why*, not *what*.** Match the surrounding house style — see `src/utils/period.ts` and `src/features/transactions/categoryBreakdown.ts` for the register.
- **Run `pnpm typecheck && pnpm test` before every commit.** Both must pass.
- Commit after each task. Do not push.

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/period.ts` *(modify)* | Adds `YearPeriod`, `yearKey`, `currentYear`, `availableYears`, and a `MonthOrDatePeriod` alias |
| `src/features/report/reportData.ts` | Pure: `(transactions, period, locale) → ReportData` |
| `src/features/report/granularity.ts` | Pure: granularity detection, switching between year/month/day, filename slug |
| `src/features/report/pdfLayout.ts` | Pure: pagination, hex→rgb, text clipping |
| `src/features/report/ReportPeriodPicker.tsx` | Granularity toggle + value control |
| `src/features/report/TrendChart.tsx` | SVG income/expense bars |
| `src/features/report/ReportScreen.tsx` | The page; the only stateful piece |
| `src/features/report/pdf.ts` | jsPDF driver, dynamically imported. No React |
| `src/components/Icon.tsx` *(modify)* | Adds a `chart` glyph |
| `src/components/BottomNav.tsx` *(modify)* | Fifth tab |
| `src/AppShell.tsx` *(modify)* | Lazy route |
| `src/i18n/translations.ts` *(modify)* | New keys, EN + ID |

---

### Task 1: Year period

Adds the third `Period` variant. The transactions screen never creates one, so instead of teaching `Summary` and `PeriodBar` about years, their prop types narrow to the two kinds they actually handle — which is both more honest and leaves their bodies untouched.

**Files:**
- Modify: `src/utils/period.ts`
- Modify: `src/features/transactions/Summary.tsx:13` (prop type only)
- Modify: `src/features/transactions/PeriodBar.tsx:9` (prop type only)
- Modify: `src/features/transactions/TransactionsScreen.tsx:56` (state type only)
- Test: `src/utils/period.test.ts` (extend the existing file)

**Interfaces:**
- Consumes: nothing.
- Produces: `YearPeriod`, `Period` (now a 3-way union), `MonthOrDatePeriod`, `yearKey(isoDate: string): string`, `currentYear(todayISO: string): YearPeriod`, `availableYears(txns: Transaction[], todayISO: string): string[]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/period.test.ts`. Note the file already defines a `tx()` helper at the top — reuse it. Add `currentYear`, `availableYears`, `yearKey` to the existing import on line 2.

```ts
describe('yearKey', () => {
  it('takes the year of an ISO date', () => {
    expect(yearKey('2026-08-04')).toBe('2026');
  });
});

describe('currentYear', () => {
  it('takes the year of the reference date', () => {
    expect(currentYear('2026-08-04')).toEqual({ kind: 'year', year: '2026' });
  });
});

describe('availableYears', () => {
  it('lists every year holding a transaction, newest first', () => {
    const txns = [tx({ date: '2024-06-15' }), tx({ date: '2026-04-02' }), tx({ date: '2025-01-01' })];
    expect(availableYears(txns, '2026-08-01')).toEqual(['2026', '2025', '2024']);
  });

  it('always includes the current year so a new sheet is not empty', () => {
    expect(availableYears([], '2026-08-01')).toEqual(['2026']);
  });

  it('does not repeat the current year when it also holds transactions', () => {
    expect(availableYears([tx({ date: '2026-03-05' })], '2026-08-01')).toEqual(['2026']);
  });

  it('leaves out years in the future', () => {
    const txns = [tx({ date: '2027-01-01' }), tx({ date: '2025-07-01' })];
    expect(availableYears(txns, '2026-08-01')).toEqual(['2026', '2025']);
  });
});

describe('filterByPeriod with a year', () => {
  const txns = [
    tx({ id: 'a', date: '2026-01-01' }),
    tx({ id: 'b', date: '2026-12-31' }),
    tx({ id: 'c', date: '2025-12-31' }),
    tx({ id: 'd', date: '2027-01-01' })
  ];

  it('keeps only transactions in the year, across its boundaries', () => {
    const kept = filterByPeriod(txns, { kind: 'year', year: '2026' });
    expect(kept.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for a year with no transactions', () => {
    expect(filterByPeriod(txns, { kind: 'year', year: '2020' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/utils/period.test.ts`
Expected: FAIL — `yearKey is not a function` / `currentYear is not a function` / `availableYears is not a function`.

- [ ] **Step 3: Add the year variant to `src/utils/period.ts`**

Insert after the `DatePeriod` interface (line 18) and replace the `Period` alias on line 20:

```ts
export interface YearPeriod {
  kind: 'year';
  /** 'YYYY' */
  year: string;
}

export type Period = YearPeriod | MonthPeriod | DatePeriod;

/**
 * The two kinds the transactions screen works in. Years are reachable only
 * from the report, so the components on that screen take this narrower type
 * rather than carrying a branch for a period they are never handed.
 */
export type MonthOrDatePeriod = MonthPeriod | DatePeriod;
```

Add next to `monthKey` (line 23):

```ts
/** Year prefix of an ISO date, e.g. "2026-07-25" -> "2026". */
export function yearKey(isoDate: string): string {
  return isoDate.slice(0, 4);
}

export function currentYear(todayISO: string): YearPeriod {
  return { kind: 'year', year: yearKey(todayISO) };
}
```

Add after `availableMonths` (line 68), mirroring it exactly:

```ts
/**
 * Years the report can scope to: every year containing a transaction, plus the
 * current one so a new sheet is not empty, newest first. Future years are
 * excluded for the same reason months are - a report is for what has happened.
 */
export function availableYears(txns: Transaction[], todayISO: string): string[] {
  const thisYear = yearKey(todayISO);
  const keys = new Set<string>([thisYear]);
  for (const t of txns) {
    const key = yearKey(t.date);
    if (key <= thisYear) keys.add(key);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}
```

Replace `filterByPeriod` (line 70) with:

```ts
export function filterByPeriod(txns: Transaction[], period: Period): Transaction[] {
  if (period.kind === 'date') return txns.filter((t) => t.date === period.date);
  if (period.kind === 'year') return txns.filter((t) => yearKey(t.date) === period.year);
  return txns.filter((t) => monthKey(t.date) === period.key);
}
```

- [ ] **Step 4: Narrow the three transactions-screen call sites**

These three edits are type-only — no logic changes. Without them `pnpm typecheck` fails, because both components read `period.key` after excluding only `'date'`.

In `src/features/transactions/Summary.tsx`, change the import on line 5 and the prop on line 13:

```ts
import { currentMonth, monthName, previousMonth, type MonthOrDatePeriod } from '../../utils/period';
```
```ts
  period: MonthOrDatePeriod;
```

In `src/features/transactions/PeriodBar.tsx`, change the import on line 4 and the prop on line 9:

```ts
import { currentMonth, monthKey, monthName, previousMonth, type MonthOrDatePeriod } from '../../utils/period';
```
```ts
  period: MonthOrDatePeriod;
```

In `src/features/transactions/TransactionsScreen.tsx`, change the import on line 21 and the state on line 56:

```ts
import { availableMonths, currentMonth, filterByPeriod, type MonthOrDatePeriod } from '../../utils/period';
```
```ts
  const [period, setPeriodState] = useState<MonthOrDatePeriod>(() => currentMonth(todayISO));
```

Also change `setPeriod`'s parameter on line 93 from `next: Period` to `next: MonthOrDatePeriod`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/period.ts src/utils/period.test.ts src/features/transactions/Summary.tsx src/features/transactions/PeriodBar.tsx src/features/transactions/TransactionsScreen.tsx
git commit -m "feat: add a year variant to the period model"
```

---

### Task 2: The report model

The pure heart of the feature. Everything the screen and the PDF display comes from here, computed once.

**Files:**
- Create: `src/features/report/reportData.ts`
- Test: `src/features/report/reportData.test.ts`

**Interfaces:**
- Consumes: `filterByPeriod`, `Period` (Task 1); existing `computeTotals` (`src/utils/summary.ts:13`), `buildBreakdown` / `Breakdown` (`src/features/transactions/categoryBreakdown.ts:48`).
- Produces: `TrendBucket { label, income, expense }`, `ReportData { period, totals: { income, expense, net }, buckets, breakdown, rows }`, `buildReport(txns, period, locale): ReportData`, `daysInMonth(key: string): number`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/report/reportData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildReport, daysInMonth } from './reportData';
import type { Transaction } from '../../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: 'Food', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('daysInMonth', () => {
  it('counts a 31-day month', () => expect(daysInMonth('2026-01')).toBe(31));
  it('counts a 30-day month', () => expect(daysInMonth('2026-04')).toBe(30));
  it('counts a common February', () => expect(daysInMonth('2026-02')).toBe(28));
  it('counts a leap February', () => expect(daysInMonth('2024-02')).toBe(29));
  it('counts December, where the month index rolls the year', () => {
    expect(daysInMonth('2026-12')).toBe(31);
  });
});

describe('buildReport totals', () => {
  it('sums income and expense in the period and nets them', () => {
    const txns = [
      tx({ type: 'income', amount: 1000, date: '2026-07-05' }),
      tx({ type: 'expense', amount: 400, date: '2026-07-06' }),
      tx({ type: 'expense', amount: 999, date: '2026-08-01' })
    ];
    const report = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(report.totals).toEqual({ income: 1000, expense: 400, net: 600 });
  });

  it('nets negative when the period spent more than it earned', () => {
    const txns = [tx({ type: 'expense', amount: 500, date: '2026-07-05' })];
    const report = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(report.totals).toEqual({ income: 0, expense: 500, net: -500 });
  });
});

describe('buildReport year buckets', () => {
  it('always returns twelve months in order, including empty ones', () => {
    const txns = [
      tx({ type: 'income', amount: 300, date: '2026-01-15' }),
      tx({ type: 'expense', amount: 120, date: '2026-01-20' }),
      tx({ type: 'expense', amount: 50, date: '2026-12-31' })
    ];
    const { buckets } = buildReport(txns, { kind: 'year', year: '2026' }, 'en');

    expect(buckets).toHaveLength(12);
    expect(buckets.map((b) => b.label)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ]);
    expect(buckets[0]).toEqual({ label: 'Jan', income: 300, expense: 120 });
    expect(buckets[5]).toEqual({ label: 'Jun', income: 0, expense: 0 });
    expect(buckets[11]).toEqual({ label: 'Dec', income: 0, expense: 50 });
  });

  it('names the months in the active locale', () => {
    const { buckets } = buildReport([], { kind: 'year', year: '2026' }, 'id');
    expect(buckets[0].label).toBe('Jan');
    expect(buckets[7].label).toBe('Agu');
  });
});

describe('buildReport month buckets', () => {
  it('returns one bucket per day of a 31-day month', () => {
    const { buckets } = buildReport([], { kind: 'month', key: '2026-07' }, 'en');
    expect(buckets).toHaveLength(31);
    expect(buckets[0].label).toBe('1');
    expect(buckets[30].label).toBe('31');
  });

  it('returns 28 buckets for a common February and 29 for a leap one', () => {
    expect(buildReport([], { kind: 'month', key: '2026-02' }, 'en').buckets).toHaveLength(28);
    expect(buildReport([], { kind: 'month', key: '2024-02' }, 'en').buckets).toHaveLength(29);
  });

  it('lands each transaction on its own day', () => {
    const txns = [
      tx({ type: 'expense', amount: 70, date: '2026-07-01' }),
      tx({ type: 'income', amount: 900, date: '2026-07-25' })
    ];
    const { buckets } = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(buckets[0]).toEqual({ label: '1', income: 0, expense: 70 });
    expect(buckets[24]).toEqual({ label: '25', income: 900, expense: 0 });
  });
});

describe('buildReport day period', () => {
  it('produces no buckets, because a single bar is not a chart', () => {
    const txns = [tx({ type: 'expense', amount: 70, date: '2026-07-01' })];
    const report = buildReport(txns, { kind: 'date', date: '2026-07-01' }, 'en');
    expect(report.buckets).toEqual([]);
    expect(report.totals.expense).toBe(70);
    expect(report.breakdown.total).toBe(70);
  });
});

describe('buildReport rows', () => {
  it('returns the in-period transactions newest first', () => {
    const txns = [
      tx({ id: 'old', date: '2026-07-01' }),
      tx({ id: 'new', date: '2026-07-28' }),
      tx({ id: 'mid', date: '2026-07-14' }),
      tx({ id: 'out', date: '2026-06-30' })
    ];
    const { rows } = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks same-day ties on creation time, newest first', () => {
    const txns = [
      tx({ id: 'first', date: '2026-07-10', createdAt: '2026-07-10T08:00:00.000Z' }),
      tx({ id: 'second', date: '2026-07-10', createdAt: '2026-07-10T19:00:00.000Z' })
    ];
    const { rows } = buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(rows.map((r) => r.id)).toEqual(['second', 'first']);
  });

  it('does not mutate the input array', () => {
    const txns = [tx({ id: 'a', date: '2026-07-01' }), tx({ id: 'b', date: '2026-07-28' })];
    buildReport(txns, { kind: 'month', key: '2026-07' }, 'en');
    expect(txns.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('buildReport on an empty period', () => {
  it('zeroes everything rather than returning nulls', () => {
    const report = buildReport([], { kind: 'month', key: '2026-07' }, 'en');
    expect(report.totals).toEqual({ income: 0, expense: 0, net: 0 });
    expect(report.breakdown).toEqual({ segments: [], total: 0 });
    expect(report.rows).toEqual([]);
    expect(report.buckets).toHaveLength(31);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/features/report/reportData.test.ts`
Expected: FAIL — cannot resolve `./reportData`.

- [ ] **Step 3: Write `src/features/report/reportData.ts`**

```ts
import { filterByPeriod, type Period } from '../../utils/period';
import { computeTotals } from '../../utils/summary';
import { buildBreakdown, type Breakdown } from '../transactions/categoryBreakdown';
import type { Locale } from '../../i18n/locale';
import type { Transaction } from '../../types';

/** One column of the trend chart: a month of a year, or a day of a month. */
export interface TrendBucket {
  /** Axis label - 'Jan'..'Dec' for a year, '1'..'31' for a month. */
  label: string;
  income: number;
  expense: number;
}

/**
 * Everything the report shows, computed once. The screen and the PDF both read
 * this value rather than each recomputing from transactions, so the document
 * and the display cannot disagree about a figure.
 */
export interface ReportData {
  period: Period;
  totals: { income: number; expense: number; net: number };
  /** Empty for a single day: one bar is not a chart. */
  buckets: TrendBucket[];
  breakdown: Breakdown;
  /** The in-period transactions, newest first, for the PDF's table. */
  rows: Transaction[];
}

/**
 * Days in a 'YYYY-MM' key. Day 0 of the following month is the last day of this
 * one, which gets February and leap years right without a rule of its own.
 * UTC throughout so a machine west of Greenwich cannot shift the boundary.
 */
export function daysInMonth(key: string): number {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Short month names in the active locale, January first. */
function monthLabels(locale: Locale): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2026, i, 1))));
}

/**
 * Buckets are allocated up front and filled by index rather than grouped from
 * the data, which is what keeps empty months and empty days on the axis. A year
 * that only saw spending in January should read as a mostly empty year, not as
 * a one-column chart.
 */
function bucketsFor(scoped: Transaction[], period: Period, locale: Locale): TrendBucket[] {
  if (period.kind === 'date') return [];

  const size = period.kind === 'year' ? 12 : daysInMonth(period.key);
  const labels = period.kind === 'year'
    ? monthLabels(locale)
    : Array.from({ length: size }, (_, i) => String(i + 1));
  const buckets: TrendBucket[] = labels.map((label) => ({ label, income: 0, expense: 0 }));

  for (const t of scoped) {
    // 'YYYY-MM-DD': month is chars 5-7, day is 8-10. Both are 1-based.
    const index = Number(period.kind === 'year' ? t.date.slice(5, 7) : t.date.slice(8, 10)) - 1;
    if (index < 0 || index >= size) continue;
    if (t.type === 'income') buckets[index].income += t.amount;
    else buckets[index].expense += t.amount;
  }

  return buckets;
}

export function buildReport(
  txns: Transaction[],
  period: Period,
  locale: Locale
): ReportData {
  const scoped = filterByPeriod(txns, period);
  const { income, expense } = computeTotals(scoped);

  return {
    period,
    totals: { income, expense, net: income - expense },
    buckets: bucketsFor(scoped, period, locale),
    breakdown: buildBreakdown(scoped),
    // Copied before sorting: `scoped` is a fresh array from filterByPeriod, but
    // relying on that would make this fragile if the filter ever short-circuits
    // and returns its input.
    rows: [...scoped].sort((a, b) =>
      b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAt.localeCompare(a.createdAt)
    )
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/features/report/reportData.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

If the locale test fails on `'Agu'`, print the actual value first — Node's ICU data decides Indonesian short month names, and the assertion should match the runtime rather than be forced.

- [ ] **Step 5: Commit**

```bash
git add src/features/report/reportData.ts src/features/report/reportData.test.ts
git commit -m "feat: build the report model from transactions and a period"
```

---

### Task 3: PDF layout arithmetic

Pure helpers the PDF driver needs. Split out so pagination — including the off-by-one where the first page holds fewer rows — is testable without asserting on PDF bytes.

**Files:**
- Create: `src/features/report/pdfLayout.ts`
- Test: `src/features/report/pdfLayout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `rowsPerPage(usableHeight: number, rowHeight: number): number`, `paginate<T>(rows: T[], firstPageCapacity: number, pageCapacity: number): T[][]`, `rgb(hex: string): [number, number, number]`, `clip(text: string, max: number): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/report/pdfLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clip, paginate, rgb, rowsPerPage } from './pdfLayout';

describe('rowsPerPage', () => {
  it('fits whole rows only', () => {
    expect(rowsPerPage(100, 6)).toBe(16);
  });

  it('is zero when not even one row fits', () => {
    expect(rowsPerPage(4, 6)).toBe(0);
  });

  it('never returns a negative count for a negative space', () => {
    expect(rowsPerPage(-20, 6)).toBe(0);
  });

  it('is zero rather than infinite for a zero row height', () => {
    expect(rowsPerPage(100, 0)).toBe(0);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 10 }, (_, i) => i);

  it('returns no pages for no rows', () => {
    expect(paginate([], 3, 5)).toEqual([]);
  });

  it('keeps everything on the first page when it fits exactly', () => {
    expect(paginate([1, 2, 3], 3, 5)).toEqual([[1, 2, 3]]);
  });

  it('spills a single extra row onto a second page', () => {
    expect(paginate([1, 2, 3, 4], 3, 5)).toEqual([[1, 2, 3], [4]]);
  });

  it('uses the larger capacity for every page after the first', () => {
    expect(paginate(rows, 2, 4)).toEqual([[0, 1], [2, 3, 4, 5], [6, 7, 8, 9]]);
  });

  it('starts on a fresh page when the first page has no room at all', () => {
    expect(paginate([1, 2, 3], 0, 2)).toEqual([[1, 2], [3]]);
  });

  it('does not loop forever on a zero page capacity', () => {
    expect(paginate([1, 2, 3], 1, 0)).toEqual([[1], [2], [3]]);
  });
});

describe('rgb', () => {
  it('splits a six-digit hex into channels', () => {
    expect(rgb('#2a78d6')).toEqual([42, 120, 214]);
  });

  it('accepts a hex with no leading hash and surrounding space', () => {
    expect(rgb('  1baf7a ')).toEqual([27, 175, 122]);
  });

  it('expands a three-digit shorthand', () => {
    expect(rgb('#fff')).toEqual([255, 255, 255]);
  });

  it('falls back to black for something unparseable', () => {
    expect(rgb('')).toEqual([0, 0, 0]);
    expect(rgb('not a colour')).toEqual([0, 0, 0]);
  });
});

describe('clip', () => {
  it('leaves text that already fits', () => {
    expect(clip('Groceries', 20)).toBe('Groceries');
  });

  it('marks text it had to cut', () => {
    expect(clip('A very long note indeed', 10)).toBe('A very ...');
  });

  it('produces exactly the requested length when it cuts', () => {
    expect(clip('A very long note indeed', 10)).toHaveLength(10);
  });

  it('drops the marker when there is no room for it', () => {
    expect(clip('abcdef', 3)).toBe('abc');
  });

  it('returns nothing for no room', () => {
    expect(clip('abcdef', 0)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/features/report/pdfLayout.test.ts`
Expected: FAIL — cannot resolve `./pdfLayout`.

- [ ] **Step 3: Write `src/features/report/pdfLayout.ts`**

```ts
// Geometry and text arithmetic for the exported PDF, kept apart from pdf.ts so
// the parts worth testing can be tested without generating a document and
// reading its bytes back.

/** How many rows of `rowHeight` fit in `usableHeight`. Never negative. */
export function rowsPerPage(usableHeight: number, rowHeight: number): number {
  if (rowHeight <= 0) return 0;
  return Math.max(0, Math.floor(usableHeight / rowHeight));
}

/**
 * Splits rows across pages. The first page takes fewer, because the summary
 * block sits above the table there - that difference is the whole reason this
 * is a function rather than a slice loop inlined at the call site.
 */
export function paginate<T>(rows: T[], firstPageCapacity: number, pageCapacity: number): T[][] {
  if (rows.length === 0) return [];

  const pages: T[][] = [];
  // A capacity of zero for the continuation pages would never advance, so the
  // floor is one row per page: a cramped document still terminates.
  const rest = Math.max(1, pageCapacity);
  let taken = 0;

  if (firstPageCapacity > 0) {
    pages.push(rows.slice(0, firstPageCapacity));
    taken = firstPageCapacity;
  }
  while (taken < rows.length) {
    pages.push(rows.slice(taken, taken + rest));
    taken += rest;
  }

  return pages;
}

/**
 * '#2a78d6' -> [42, 120, 214]. The palette arrives as CSS custom property text
 * read off the document, and jsPDF wants numeric channels. Anything that does
 * not parse becomes black rather than throwing - a wrong colour is a far better
 * outcome than a failed export.
 */
export function rgb(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0];
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

/**
 * Clips text to a column width in characters. Notes are truncated rather than
 * wrapped so every table row stays exactly one line tall, which is what lets
 * the row arithmetic above be exact.
 *
 * The marker is three ASCII periods, not an ellipsis character: the document
 * uses jsPDF's built-in Helvetica with no embedded font, and staying inside
 * plain ASCII is what makes that safe.
 */
export function clip(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= 3) return text.slice(0, max);
  return `${text.slice(0, max - 3)}...`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/features/report/pdfLayout.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/report/pdfLayout.ts src/features/report/pdfLayout.test.ts
git commit -m "feat: add pagination and colour helpers for the report PDF"
```

---

### Task 4: Granularity switching

The rule for where the user lands when they tap Year/Month/Day. Pure, so the "keep them near where they were" behaviour is pinned by tests rather than by clicking around.

**Files:**
- Create: `src/features/report/granularity.ts`
- Test: `src/features/report/granularity.test.ts`

**Interfaces:**
- Consumes: `Period`, `monthKey` (Task 1 / existing).
- Produces: `Granularity = 'year' | 'month' | 'day'`, `granularityOf(period): Granularity`, `switchGranularity(period, to, months, todayISO): Period`, `periodSlug(period): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/report/granularity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { granularityOf, periodSlug, switchGranularity } from './granularity';

// Newest first, matching availableMonths.
const MONTHS = ['2026-08', '2026-05', '2026-02', '2025-11'];
const TODAY = '2026-08-04';

describe('granularityOf', () => {
  it('maps each period kind to its control', () => {
    expect(granularityOf({ kind: 'year', year: '2026' })).toBe('year');
    expect(granularityOf({ kind: 'month', key: '2026-08' })).toBe('month');
    expect(granularityOf({ kind: 'date', date: '2026-08-04' })).toBe('day');
  });
});

describe('switchGranularity to year', () => {
  it('takes the year the month sat in', () => {
    expect(switchGranularity({ kind: 'month', key: '2025-11' }, 'year', MONTHS, TODAY))
      .toEqual({ kind: 'year', year: '2025' });
  });

  it('takes the year the day sat in', () => {
    expect(switchGranularity({ kind: 'date', date: '2025-11-20' }, 'year', MONTHS, TODAY))
      .toEqual({ kind: 'year', year: '2025' });
  });
});

describe('switchGranularity to month', () => {
  it('takes the month the day sat in', () => {
    expect(switchGranularity({ kind: 'date', date: '2026-05-20' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2026-05' });
  });

  it('lands on the newest month with data inside the year', () => {
    expect(switchGranularity({ kind: 'year', year: '2026' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2026-08' });
    expect(switchGranularity({ kind: 'year', year: '2025' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2025-11' });
  });

  it('falls back to January of a year that has no months with data', () => {
    expect(switchGranularity({ kind: 'year', year: '2019' }, 'month', MONTHS, TODAY))
      .toEqual({ kind: 'month', key: '2019-01' });
  });
});

describe('switchGranularity to day', () => {
  it('takes the first of the month', () => {
    expect(switchGranularity({ kind: 'month', key: '2026-05' }, 'day', MONTHS, TODAY))
      .toEqual({ kind: 'date', date: '2026-05-01' });
  });

  it('takes the first of the year', () => {
    expect(switchGranularity({ kind: 'year', year: '2025' }, 'day', MONTHS, TODAY))
      .toEqual({ kind: 'date', date: '2025-01-01' });
  });

  it('clamps to today, because the day input cannot go past it', () => {
    expect(switchGranularity({ kind: 'month', key: '2026-08' }, 'day', MONTHS, '2026-08-04'))
      .toEqual({ kind: 'date', date: '2026-08-01' });
    expect(switchGranularity({ kind: 'year', year: '2026' }, 'day', MONTHS, '2025-06-01'))
      .toEqual({ kind: 'date', date: '2025-06-01' });
  });

  it('keeps the day it already had', () => {
    expect(switchGranularity({ kind: 'date', date: '2026-05-20' }, 'day', MONTHS, TODAY))
      .toEqual({ kind: 'date', date: '2026-05-20' });
  });
});

describe('periodSlug', () => {
  it('names each period for a filename', () => {
    expect(periodSlug({ kind: 'year', year: '2026' })).toBe('2026');
    expect(periodSlug({ kind: 'month', key: '2026-08' })).toBe('2026-08');
    expect(periodSlug({ kind: 'date', date: '2026-08-04' })).toBe('2026-08-04');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/features/report/granularity.test.ts`
Expected: FAIL — cannot resolve `./granularity`.

- [ ] **Step 3: Write `src/features/report/granularity.ts`**

```ts
import { monthKey, type Period } from '../../utils/period';

export type Granularity = 'year' | 'month' | 'day';

export function granularityOf(period: Period): Granularity {
  if (period.kind === 'year') return 'year';
  if (period.kind === 'month') return 'month';
  return 'day';
}

function yearOf(period: Period): string {
  if (period.kind === 'year') return period.year;
  if (period.kind === 'month') return period.key.slice(0, 4);
  return period.date.slice(0, 4);
}

/** `months` is newest-first, per availableMonths, so [0] is the latest. */
function monthOf(period: Period, months: string[]): string {
  if (period.kind === 'month') return period.key;
  if (period.kind === 'date') return monthKey(period.date);
  const inYear = months.filter((key) => key.startsWith(`${period.year}-`));
  return inYear.length > 0 ? inYear[0] : `${period.year}-01`;
}

function dayOf(period: Period, todayISO: string): string {
  const first =
    period.kind === 'date' ? period.date
    : period.kind === 'month' ? `${period.key}-01`
    : `${period.year}-01-01`;
  // The day input carries max={todayISO}; handing it a later value would show a
  // date the control itself rejects.
  return first > todayISO ? todayISO : first;
}

/**
 * Where the user lands when they change granularity. The rule throughout is to
 * stay near where they already were - switching to Month from a year opens that
 * year's most recent month with data, not January and not today. Landing
 * somewhere unrelated after one tap is the thing worth avoiding.
 */
export function switchGranularity(
  period: Period,
  to: Granularity,
  months: string[],
  todayISO: string
): Period {
  if (to === 'year') return { kind: 'year', year: yearOf(period) };
  if (to === 'month') return { kind: 'month', key: monthOf(period, months) };
  return { kind: 'date', date: dayOf(period, todayISO) };
}

/** The period as it appears in an export filename. */
export function periodSlug(period: Period): string {
  if (period.kind === 'year') return period.year;
  if (period.kind === 'month') return period.key;
  return period.date;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/features/report/granularity.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/report/granularity.ts src/features/report/granularity.test.ts
git commit -m "feat: add granularity switching rules for the report period"
```

---

### Task 5: Translation keys

All strings for the screen and the PDF, in one pass, so later tasks never stop to add copy.

**Files:**
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `TranslationKey`s used by Tasks 6–10. The month and day picker labels reuse the existing `periodPickMonth` / `periodPickDay`; the doughnut's `breakdownOther`, `breakdownEmpty` and `uncategorized` are reused too.

- [ ] **Step 1: Add the English keys**

In the `en` object in `src/i18n/translations.ts`, add after the `// Spending chart` block:

```ts
  // Report
  navReport: 'Report',
  reportGranularityLabel: 'Report period',
  reportYear: 'Year',
  reportMonth: 'Month',
  reportDay: 'Day',
  reportPickYear: 'Pick a year',
  reportNetLabel: 'Net',
  reportTrendTitle: 'Income and expense',
  reportCategoryTable: 'By category',
  reportEmpty: 'Nothing recorded in this period.',
  reportExportPdf: 'Export PDF',
  reportExporting: 'Preparing PDF...',
  reportExportFailed: 'Could not create the PDF. Try again while online.',

  // PDF document
  pdfGeneratedOn: 'Generated {date}',
  pdfTransactions: 'Transactions',
  pdfPageOf: 'Page {page} of {total}',
  pdfColDate: 'Date',
  pdfColCategory: 'Category',
  pdfColNote: 'Note',
  pdfColAccount: 'Account',
  pdfColAmount: 'Amount',
  pdfColShare: 'Share',
```

- [ ] **Step 2: Add the matching Indonesian keys**

In the `id` object, at the equivalent position. `Pemasukan` / `Pengeluaran` are the terms already used for `incomeLabel` / `expenseLabel` (lines 322–323) — stay consistent with them:

```ts
  // Report
  navReport: 'Laporan',
  reportGranularityLabel: 'Periode laporan',
  reportYear: 'Tahun',
  reportMonth: 'Bulan',
  reportDay: 'Hari',
  reportPickYear: 'Pilih tahun',
  reportNetLabel: 'Selisih',
  reportTrendTitle: 'Pemasukan dan pengeluaran',
  reportCategoryTable: 'Per kategori',
  reportEmpty: 'Belum ada catatan pada periode ini.',
  reportExportPdf: 'Ekspor PDF',
  reportExporting: 'Menyiapkan PDF...',
  reportExportFailed: 'Tidak dapat membuat PDF. Coba lagi saat online.',

  // PDF document
  pdfGeneratedOn: 'Dibuat {date}',
  pdfTransactions: 'Transaksi',
  pdfPageOf: 'Halaman {page} dari {total}',
  pdfColDate: 'Tanggal',
  pdfColCategory: 'Kategori',
  pdfColNote: 'Catatan',
  pdfColAccount: 'Akun',
  pdfColAmount: 'Jumlah',
  pdfColShare: 'Porsi',
```

- [ ] **Step 3: Verify both objects agree**

Run: `pnpm typecheck`
Expected: clean. A key present in `en` but missing from `id` fails here, because `id` is annotated `Record<TranslationKey, string>`.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: add report and PDF translations"
```

---

### Task 6: Period picker

**Files:**
- Create: `src/features/report/ReportPeriodPicker.tsx`
- Create: `src/features/report/ReportPeriodPicker.css`

**Interfaces:**
- Consumes: `granularityOf`, `switchGranularity`, `Granularity` (Task 4); `monthName`, `Period` (Task 1 / existing); translation keys (Task 5).
- Produces: default export `ReportPeriodPicker`, props `{ period: Period; todayISO: string; years: string[]; months: string[]; onChange: (period: Period) => void }`.

- [ ] **Step 1: Write `src/features/report/ReportPeriodPicker.tsx`**

```tsx
import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { monthName, type Period } from '../../utils/period';
import { granularityOf, switchGranularity, type Granularity } from './granularity';
import type { TranslationKey } from '../../i18n/translations';
import './ReportPeriodPicker.css';

interface ReportPeriodPickerProps {
  period: Period;
  todayISO: string;
  /** Newest first, from availableYears. */
  years: string[];
  /** Newest first, from availableMonths. */
  months: string[];
  onChange: (period: Period) => void;
}

const MODES: { key: Granularity; label: TranslationKey }[] = [
  { key: 'year', label: 'reportYear' },
  { key: 'month', label: 'reportMonth' },
  { key: 'day', label: 'reportDay' }
];

/**
 * Deliberately not PeriodBar. That control is built around this-month /
 * last-month shortcuts and an icon-only day input sized for the transactions
 * screen; the report wants a plain granularity switch. Sharing the Period type
 * is the reuse that pays - sharing the widget would mean bending one control to
 * two jobs.
 */
function ReportPeriodPicker({ period, todayISO, years, months, onChange }: ReportPeriodPickerProps) {
  const { t, locale } = useI18n();
  const active = granularityOf(period);

  // The selected value must always be one of the options, or the native control
  // renders blank. switchGranularity can land on a month or year with no
  // transactions of its own, so it is folded in rather than assumed present.
  function withSelected(options: string[], selected: string): string[] {
    return options.includes(selected)
      ? options
      : [...options, selected].sort((a, b) => b.localeCompare(a));
  }

  return (
    <section className="report-period" role="group" aria-label={t('reportGranularityLabel')}>
      <div className="report-period__modes">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`report-period__mode ${active === key ? 'active' : ''}`}
            aria-pressed={active === key}
            onClick={() => onChange(switchGranularity(period, key, months, todayISO))}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {period.kind === 'year' && (
        <select
          className="report-period__value"
          value={period.year}
          aria-label={t('reportPickYear')}
          onChange={(e) => onChange({ kind: 'year', year: e.target.value })}
        >
          {withSelected(years, period.year).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      )}

      {period.kind === 'month' && (
        <select
          className="report-period__value"
          value={period.key}
          aria-label={t('periodPickMonth')}
          onChange={(e) => onChange({ kind: 'month', key: e.target.value })}
        >
          {withSelected(months, period.key).map((key) => (
            <option key={key} value={key}>
              {monthName(key, locale)}
            </option>
          ))}
        </select>
      )}

      {period.kind === 'date' && (
        <input
          className="report-period__value"
          type="date"
          value={period.date}
          max={todayISO}
          aria-label={t('periodPickDay')}
          // Clearing the field would leave the report with no period at all, so
          // an empty value is ignored and the current day stands.
          onChange={(e) => e.target.value && onChange({ kind: 'date', date: e.target.value })}
        />
      )}
    </section>
  );
}

export default memo(ReportPeriodPicker);
```

- [ ] **Step 2: Write `src/features/report/ReportPeriodPicker.css`**

```css
/* Report period picker */
.report-period {
  display: flex; flex-direction: column; gap: var(--space-3);
  padding: var(--space-4) 0;
}
.report-period__modes {
  display: flex; gap: var(--space-2);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: var(--space-1);
}
.report-period__mode {
  flex: 1; border: none; background: transparent; color: var(--muted);
  padding: var(--space-2); border-radius: var(--radius-sm);
  font-size: 0.85rem; min-height: 40px;
  transition: background-color var(--ease), color var(--ease);
}
.report-period__mode.active {
  background: var(--accent); color: var(--on-accent); font-weight: 600;
}
.report-period__value {
  width: 100%; min-height: 44px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--surface); color: var(--text); font: inherit;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (The component is not rendered anywhere yet — Task 9 wires it up.)

If `--radius-sm` or `--ease` are not defined in `src/index.css`, check what the existing components use (`grep -n 'radius-sm\|--ease' src/index.css`) and substitute the real names rather than inventing values.

- [ ] **Step 4: Commit**

```bash
git add src/features/report/ReportPeriodPicker.tsx src/features/report/ReportPeriodPicker.css
git commit -m "feat: add the report period picker"
```

---

### Task 7: Trend chart

**Files:**
- Create: `src/features/report/TrendChart.tsx`
- Create: `src/features/report/TrendChart.css`

**Interfaces:**
- Consumes: `TrendBucket` (Task 2); `incomeLabel` / `expenseLabel` / `reportTrendTitle` keys.
- Produces: default export `TrendChart`, props `{ buckets: TrendBucket[] }`.

- [ ] **Step 1: Write `src/features/report/TrendChart.tsx`**

```tsx
import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import type { TrendBucket } from './reportData';
import './TrendChart.css';

interface TrendChartProps {
  /** Never empty - the caller omits the chart entirely for a single day. */
  buckets: TrendBucket[];
}

// viewBox units. One slot per bucket holds an income bar and an expense bar
// either side of the slot's centre line.
const PLOT = 90;
const SLOT = 12;
const BAR = 4;
const AXIS = 12;

function TrendChart({ buckets }: TrendChartProps) {
  const { t } = useI18n();

  // Both series share one scale so the two bars in a slot are directly
  // comparable; the floor of 1 keeps an all-zero period from dividing by zero.
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)));
  const width = buckets.length * SLOT;

  // Thirty-one day labels do not fit; twelve months do. Every fifth day keeps
  // the axis readable without losing the shape of the month.
  const step = buckets.length > 12 ? 5 : 1;

  return (
    <section className="trend" aria-label={t('reportTrendTitle')}>
      <div className="trend__head">
        <h2 className="trend__title">{t('reportTrendTitle')}</h2>
        <ul className="trend__legend">
          <li>
            <span className="trend__swatch trend__swatch--income" aria-hidden="true" />
            {t('incomeLabel')}
          </li>
          <li>
            <span className="trend__swatch trend__swatch--expense" aria-hidden="true" />
            {t('expenseLabel')}
          </li>
        </ul>
      </div>

      <svg
        className="trend__svg"
        viewBox={`0 0 ${width} ${PLOT + AXIS}`}
        role="img"
        aria-label={t('reportTrendTitle')}
      >
        {buckets.map((bucket, i) => {
          const x = i * SLOT;
          const incomeH = (bucket.income / max) * PLOT;
          const expenseH = (bucket.expense / max) * PLOT;

          return (
            <g key={bucket.label}>
              <rect
                className="trend__bar trend__bar--income"
                x={x + SLOT / 2 - BAR - 0.5}
                y={PLOT - incomeH}
                width={BAR}
                height={incomeH}
              />
              <rect
                className="trend__bar trend__bar--expense"
                x={x + SLOT / 2 + 0.5}
                y={PLOT - expenseH}
                width={BAR}
                height={expenseH}
              />
              {i % step === 0 && (
                <text className="trend__label" x={x + SLOT / 2} y={PLOT + 9} textAnchor="middle">
                  {bucket.label}
                </text>
              )}
            </g>
          );
        })}
        <line className="trend__axis" x1="0" y1={PLOT} x2={width} y2={PLOT} />
      </svg>
    </section>
  );
}

export default memo(TrendChart);
```

- [ ] **Step 2: Write `src/features/report/TrendChart.css`**

```css
/* Trend chart */
.trend { display: flex; flex-direction: column; gap: var(--space-3); }
.trend__head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--space-3); flex-wrap: wrap;
}
.trend__title { margin: 0; font-size: 0.95rem; font-weight: 600; }
.trend__legend {
  list-style: none; margin: 0; padding: 0;
  display: flex; gap: var(--space-3); font-size: 0.75rem; color: var(--muted);
}
.trend__legend li { display: flex; align-items: center; gap: var(--space-1); }
.trend__swatch { width: 10px; height: 10px; border-radius: 3px; }
.trend__swatch--income { background: var(--income); }
.trend__swatch--expense { background: var(--expense); }
.trend__svg { display: block; width: 100%; height: auto; }
.trend__bar--income { fill: var(--income); }
.trend__bar--expense { fill: var(--expense); }
.trend__axis { stroke: var(--line); stroke-width: 0.5; }
.trend__label { font-size: 6px; fill: var(--muted); }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/report/TrendChart.tsx src/features/report/TrendChart.css
git commit -m "feat: add the report trend chart"
```

---

### Task 8: The report screen

Assembles the picker, totals, chart, doughnut and category table. The Export button is deliberately *not* here — Task 10 adds it, so this task's deliverable is a complete, reviewable read-only screen.

**Files:**
- Create: `src/features/report/ReportScreen.tsx`
- Create: `src/features/report/ReportScreen.css`

**Interfaces:**
- Consumes: `buildReport` / `ReportData` (Task 2), `ReportPeriodPicker` (Task 6), `TrendChart` (Task 7), `availableYears` / `availableMonths` / `currentMonth` / `Period` (Task 1 / existing), existing `SpendingDoughnut`, `OTHER`, `UNCATEGORIZED`, `formatIDR`.
- Produces: default export `ReportScreen`, props `ReportScreenProps { transactions: Transaction[]; todayISO: string }`. **Task 10 adds an `accountLabels` prop.**

- [ ] **Step 1: Write `src/features/report/ReportScreen.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import ReportPeriodPicker from './ReportPeriodPicker';
import TrendChart from './TrendChart';
import SpendingDoughnut from '../transactions/SpendingDoughnut';
import { buildReport } from './reportData';
import { OTHER } from '../transactions/categoryBreakdown';
import { UNCATEGORIZED } from '../transactions/categoryChips';
import {
  availableMonths,
  availableYears,
  currentMonth,
  filterByPeriod,
  type Period
} from '../../utils/period';
import type { Transaction } from '../../types';
import './ReportScreen.css';

export interface ReportScreenProps {
  transactions: Transaction[];
  todayISO: string;
}

export default function ReportScreen({ transactions, todayISO }: ReportScreenProps) {
  const { t, locale } = useI18n();
  // Opens on the current month rather than the current year: it is the scope
  // the rest of the app defaults to, so the two screens agree on first sight.
  const [period, setPeriod] = useState<Period>(() => currentMonth(todayISO));

  const years = useMemo(() => availableYears(transactions, todayISO), [transactions, todayISO]);
  const months = useMemo(() => availableMonths(transactions, todayISO), [transactions, todayISO]);
  const report = useMemo(
    () => buildReport(transactions, period, locale),
    [transactions, period, locale]
  );

  // The doughnut takes raw transactions and runs buildBreakdown itself, so it
  // gets the scoped list rather than report.breakdown.
  const scoped = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);

  function categoryName(category: string): string {
    if (category === OTHER) return t('breakdownOther');
    if (category === UNCATEGORIZED) return t('uncategorized');
    return category;
  }

  const empty = report.rows.length === 0;

  return (
    <section className="report">
      <ReportPeriodPicker
        period={period}
        todayISO={todayISO}
        years={years}
        months={months}
        onChange={setPeriod}
      />

      <div className="report-totals">
        <article className="report-totals__cell">
          <span className="report-totals__label">{t('incomeLabel')}</span>
          <span className="report-totals__value report-totals__value--income">
            {formatIDR(report.totals.income)}
          </span>
        </article>
        <article className="report-totals__cell">
          <span className="report-totals__label">{t('expenseLabel')}</span>
          <span className="report-totals__value report-totals__value--expense">
            {formatIDR(report.totals.expense)}
          </span>
        </article>
        <article className="report-totals__cell">
          <span className="report-totals__label">{t('reportNetLabel')}</span>
          <span className={`report-totals__value ${report.totals.net < 0 ? 'is-negative' : ''}`}>
            {formatIDR(report.totals.net)}
          </span>
        </article>
      </div>

      {empty ? (
        <p className="txn-list__empty">{t('reportEmpty')}</p>
      ) : (
        <>
          {report.buckets.length > 0 && <TrendChart buckets={report.buckets} />}

          <SpendingDoughnut transactions={scoped} />

          {report.breakdown.segments.length > 0 && (
            <section className="report-table" aria-label={t('reportCategoryTable')}>
              <h2 className="report-table__title">{t('reportCategoryTable')}</h2>
              <table className="report-table__grid">
                <thead>
                  <tr>
                    <th scope="col">{t('pdfColCategory')}</th>
                    <th scope="col">{t('pdfColAmount')}</th>
                    <th scope="col">{t('pdfColShare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.breakdown.segments.map((segment) => (
                    <tr key={segment.category}>
                      <td>
                        <span
                          className={`report-table__swatch doughnut__swatch--${segment.slot < 0 ? 'other' : segment.slot}`}
                          aria-hidden="true"
                        />
                        {categoryName(segment.category)}
                      </td>
                      <td className="report-table__num">{formatIDR(segment.amount)}</td>
                      <td className="report-table__num">
                        {Math.round(segment.fraction * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write `src/features/report/ReportScreen.css`**

The swatch classes `doughnut__swatch--0..5` and `--other` come from `SpendingDoughnut.css`, which is imported by the doughnut this screen already renders — so the palette does not need redefining here.

```css
/* Report screen */
.report { display: flex; flex-direction: column; gap: var(--space-5); }

.report-totals {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2);
}
.report-totals__cell {
  display: flex; flex-direction: column; gap: var(--space-1);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: var(--space-3);
  min-width: 0;
}
.report-totals__label { font-size: 0.7rem; color: var(--muted); }
.report-totals__value {
  font-size: 0.95rem; font-weight: 700; font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em; overflow-wrap: anywhere;
}
.report-totals__value--income { color: var(--income); }
.report-totals__value--expense { color: var(--expense); }
.report-totals__value.is-negative { color: var(--expense); }

.report-table { display: flex; flex-direction: column; gap: var(--space-3); }
.report-table__title { margin: 0; font-size: 0.95rem; font-weight: 600; }
.report-table__grid { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.report-table__grid th {
  text-align: left; font-size: 0.7rem; font-weight: 500; color: var(--muted);
  padding: var(--space-2); border-bottom: 1px solid var(--line);
}
.report-table__grid th:not(:first-child), .report-table__num { text-align: right; }
.report-table__grid td {
  padding: var(--space-2); border-bottom: 1px solid var(--line);
}
.report-table__num { font-variant-numeric: tabular-nums; }
.report-table__swatch {
  display: inline-block; width: 10px; height: 10px; border-radius: 3px;
  margin-right: var(--space-2); vertical-align: baseline;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: clean, all tests pass.

If `--space-5` is not defined, check the scale in `src/index.css` and use the largest that exists.

- [ ] **Step 4: Commit**

```bash
git add src/features/report/ReportScreen.tsx src/features/report/ReportScreen.css
git commit -m "feat: add the report screen"
```

---

### Task 9: Navigation

Wires the screen into the app. After this task the feature is usable end-to-end except for the export.

**Files:**
- Modify: `src/components/Icon.tsx:3-27`
- Modify: `src/components/BottomNav.tsx:6` and the button list
- Modify: `src/components/BottomNav.css:15-20`
- Modify: `src/AppShell.tsx:31-33` and `renderTabScreen` (line 355)

**Interfaces:**
- Consumes: `ReportScreen` (Task 8), `navReport` (Task 5).
- Produces: `Tab` now includes `'report'`; `IconName` now includes `'chart'`.

- [ ] **Step 1: Add the chart icon**

In `src/components/Icon.tsx`, add `| 'chart'` to the `IconName` union (after `'calendar'` on line 11) and this entry to `PATHS`:

```ts
  chart: 'M4 20h16M7.5 20v-6M12 20V5M16.5 20v-9'
```

- [ ] **Step 2: Add the tab**

In `src/components/BottomNav.tsx`, extend the `Tab` union on line 6:

```ts
export type Tab = 'transactions' | 'accounts' | 'debts' | 'savings' | 'report';
```

Add a fifth button after the savings one (before the closing `</div>` on line 55):

```tsx
      <button
        type="button"
        className={`bottom-nav__btn ${tab === 'report' ? 'active' : ''}`}
        aria-pressed={tab === 'report'}
        onClick={() => onChange('report')}
      >
        <Icon name="chart" />
        {t('navReport')}
      </button>
```

- [ ] **Step 3: Make five tabs fit**

In `src/components/BottomNav.css`, replace the `.bottom-nav__btn` rule (lines 15–19) and add a narrow-screen step after it:

```css
.bottom-nav__btn {
  flex: 1; border: none; background: transparent; color: var(--muted);
  display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
  padding: 0.5rem 0.15rem; min-height: 56px; font-size: 0.7rem;
  min-width: 0; white-space: nowrap;
}
/* Five tabs, not four. Shrinking the label one step is what keeps the row from
   wrapping on a 320px phone - the icons stay full size, since they are what the
   tab is actually recognised by. */
@media (max-width: 360px) {
  .bottom-nav__btn { font-size: 0.62rem; letter-spacing: -0.01em; }
}
```

- [ ] **Step 4: Route to the screen**

In `src/AppShell.tsx`, add to the lazy imports after line 33:

```ts
const ReportScreen = lazy(() => import('./features/report/ReportScreen'));
```

In `renderTabScreen` (line 355), add a branch before the final `return`:

```tsx
    if (tab === 'report') {
      return <ReportScreen transactions={transactions} todayISO={today} />;
    }
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: clean, all tests pass.

Then run the app and confirm by hand:

```bash
pnpm dev
```

- The Report tab appears and opens the screen.
- Year / Month / Day each change the control below and the figures.
- Switching Year → Month lands on a month inside that year, not on today.
- A day with no transactions shows the empty message and no chart.
- A month shows one bar per day; a year shows twelve.
- Narrow the window to 320px: five tabs still fit on one row.

- [ ] **Step 6: Commit**

```bash
git add src/components/Icon.tsx src/components/BottomNav.tsx src/components/BottomNav.css src/AppShell.tsx
git commit -m "feat: add the report tab to the bottom navigation"
```

---

### Task 10: PDF export

**Files:**
- Modify: `package.json` (add `jspdf`)
- Create: `src/features/report/pdf.ts`
- Modify: `src/features/report/ReportScreen.tsx` (export button, `accountLabels` prop, chunk warming)
- Modify: `src/features/report/ReportScreen.css` (button styles)
- Modify: `src/AppShell.tsx` (pass `accountLabels`)

**Interfaces:**
- Consumes: `ReportData` (Task 2), `paginate` / `rowsPerPage` / `rgb` / `clip` (Task 3), `periodSlug` (Task 4), `formatIDR`, `BreakdownSegment`.
- Produces: `exportReportPdf(options: ExportOptions): Promise<void>`.

- [ ] **Step 1: Add the dependency**

```bash
pnpm add jspdf
```

Confirm it landed in `dependencies` (not `devDependencies`) in `package.json`.

- [ ] **Step 2: Write `src/features/report/pdf.ts`**

```ts
import { formatIDR } from '../../utils/money';
import { clip, paginate, rgb, rowsPerPage } from './pdfLayout';
import type { BreakdownSegment } from '../transactions/categoryBreakdown';
import type { ReportData } from './reportData';

/** Every string the document needs, already translated by the caller. */
export interface PdfStrings {
  appTitle: string;
  periodLabel: string;
  generatedOn: string;
  income: string;
  expense: string;
  net: string;
  trendTitle: string;
  byCategory: string;
  transactions: string;
  colDate: string;
  colCategory: string;
  colNote: string;
  colAccount: string;
  colAmount: string;
  colShare: string;
  pageOf: (page: number, total: number) => string;
}

/** Hex strings read off the document root, so the PDF matches the app's theme. */
export interface PdfPalette {
  /** --cat-0 .. --cat-5 */
  categories: string[];
  /** --cat-other */
  other: string;
  income: string;
  expense: string;
}

export interface ExportOptions {
  data: ReportData;
  strings: PdfStrings;
  palette: PdfPalette;
  categoryName: (category: string) => string;
  accountLabels: Map<string, string>;
  filename: string;
}

// A4 portrait in millimetres.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ROW_H = 6;
const FOOTER_H = 12;

// Ink is fixed to the light-theme values whatever theme the app is in. Paper is
// white; a dark-theme document would print as a black rectangle.
const INK: [number, number, number] = [17, 17, 17];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [220, 222, 224];

type Doc = import('jspdf').jsPDF;

function colourOf(segment: BreakdownSegment, palette: PdfPalette): string {
  return segment.slot < 0 ? palette.other : palette.categories[segment.slot] ?? palette.other;
}

/**
 * A ring segment is a polyline sampled along the arc, stroked with the line
 * width set to the ring thickness. jsPDF has no arc primitive, and this needs
 * no bezier approximation - at two degrees per step it is indistinguishable
 * from a true arc, and it stays vector.
 */
function drawRing(
  doc: Doc,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  segments: BreakdownSegment[],
  palette: PdfPalette
): void {
  doc.setLineWidth(thickness);
  let start = -Math.PI / 2; // twelve o'clock, matching the on-screen ring

  for (const segment of segments) {
    const sweep = segment.fraction * Math.PI * 2;
    const steps = Math.max(2, Math.ceil((sweep * 180) / Math.PI / 2));
    doc.setDrawColor(...rgb(colourOf(segment, palette)));

    let px = cx + radius * Math.cos(start);
    let py = cy + radius * Math.sin(start);
    for (let i = 1; i <= steps; i++) {
      const angle = start + (sweep * i) / steps;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      doc.line(px, py, x, y);
      px = x;
      py = y;
    }
    start += sweep;
  }

  doc.setLineWidth(0.2);
}

function drawTrend(doc: Doc, data: ReportData, palette: PdfPalette, top: number, height: number): void {
  const { buckets } = data;
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)));
  const slot = CONTENT_W / buckets.length;
  const bar = Math.min(2.2, slot / 2 - 0.3);
  const baseline = top + height;

  buckets.forEach((bucket, i) => {
    const centre = MARGIN + i * slot + slot / 2;
    const incomeH = (bucket.income / max) * height;
    const expenseH = (bucket.expense / max) * height;

    doc.setFillColor(...rgb(palette.income));
    doc.rect(centre - bar - 0.2, baseline - incomeH, bar, incomeH, 'F');
    doc.setFillColor(...rgb(palette.expense));
    doc.rect(centre + 0.2, baseline - expenseH, bar, expenseH, 'F');
  });

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, baseline, MARGIN + CONTENT_W, baseline);

  // Twelve month labels fit; thirty-one day numbers do not.
  const step = buckets.length > 12 ? 5 : 1;
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  buckets.forEach((bucket, i) => {
    if (i % step !== 0) return;
    doc.text(bucket.label, MARGIN + i * slot + slot / 2, baseline + 3.5, { align: 'center' });
  });
}

/** Draws the page-1 summary block and returns the y it ended at. */
function drawSummary(doc: Doc, opts: ExportOptions): number {
  const { data, strings, palette } = opts;
  let y = MARGIN + 6;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(strings.appTitle, MARGIN, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(strings.periodLabel, MARGIN, y);

  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(strings.generatedOn, MARGIN, y);

  // Totals, three even columns.
  y += 10;
  const column = CONTENT_W / 3;
  const cells: [string, number, [number, number, number]][] = [
    [strings.income, data.totals.income, rgb(palette.income)],
    [strings.expense, data.totals.expense, rgb(palette.expense)],
    [strings.net, data.totals.net, data.totals.net < 0 ? rgb(palette.expense) : INK]
  ];
  cells.forEach(([label, value, colour], i) => {
    const x = MARGIN + i * column;
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y);
    doc.setFontSize(12);
    doc.setTextColor(...colour);
    doc.setFont('helvetica', 'bold');
    doc.text(formatIDR(value), x, y + 6);
  });
  y += 12;

  if (data.buckets.length > 0) {
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(strings.trendTitle, MARGIN, y);
    y += 4;
    drawTrend(doc, data, palette, y, 30);
    y += 30 + 6;
  }

  const segments = data.breakdown.segments;
  if (segments.length > 0) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(strings.byCategory, MARGIN, y);
    y += 5;

    // The ring sits left, the table to its right, so the two read as one block.
    const ringTop = y;
    drawRing(doc, MARGIN + 20, ringTop + 20, 15, 7, segments, opts.palette);

    const tableX = MARGIN + 46;
    const amountX = MARGIN + CONTENT_W - 24;
    const shareX = MARGIN + CONTENT_W;
    let rowY = ringTop + 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(strings.colCategory, tableX, rowY);
    doc.text(strings.colAmount, amountX, rowY, { align: 'right' });
    doc.text(strings.colShare, shareX, rowY, { align: 'right' });
    rowY += 4;

    doc.setFontSize(9);
    for (const segment of segments) {
      doc.setFillColor(...rgb(colourOf(segment, opts.palette)));
      doc.rect(tableX, rowY - 2.4, 2.4, 2.4, 'F');
      doc.setTextColor(...INK);
      doc.text(clip(opts.categoryName(segment.category), 28), tableX + 4, rowY);
      doc.text(formatIDR(segment.amount), amountX, rowY, { align: 'right' });
      doc.setTextColor(...MUTED);
      doc.text(`${Math.round(segment.fraction * 100)}%`, shareX, rowY, { align: 'right' });
      rowY += 5;
    }

    // The ring is 40mm tall; a one-segment table is shorter than that.
    y = Math.max(rowY, ringTop + 40);
  }

  return y;
}

function drawTableHeader(doc: Doc, strings: PdfStrings, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(strings.transactions, MARGIN, y);

  const headY = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(strings.colDate, MARGIN, headY);
  doc.text(strings.colCategory, MARGIN + 24, headY);
  doc.text(strings.colNote, MARGIN + 62, headY);
  doc.text(strings.colAccount, MARGIN + 112, headY);
  doc.text(strings.colAmount, MARGIN + CONTENT_W, headY, { align: 'right' });

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, headY + 1.5, MARGIN + CONTENT_W, headY + 1.5);

  return headY + 6;
}

function drawRows(doc: Doc, rows: ReportData['rows'], opts: ExportOptions, top: number): void {
  let y = top;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  for (const row of rows) {
    doc.setTextColor(...MUTED);
    doc.text(row.date, MARGIN, y);
    doc.setTextColor(...INK);
    doc.text(clip(row.category || '-', 22), MARGIN + 24, y);
    doc.text(clip(row.note ?? '', 28), MARGIN + 62, y);
    doc.text(clip(opts.accountLabels.get(row.accountId ?? '') ?? '', 18), MARGIN + 112, y);

    const signed = row.type === 'income' ? row.amount : -row.amount;
    doc.setTextColor(...rgb(row.type === 'income' ? opts.palette.income : opts.palette.expense));
    doc.text(formatIDR(signed), MARGIN + CONTENT_W, y, { align: 'right' });

    y += ROW_H;
  }
}

async function deliver(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/pdf' });

  // The share sheet is the path that works in an installed iOS PWA, where an
  // anchor download is unreliable.
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // Dismissing the sheet is not a failure, and must not then trigger a
      // download the user did not ask for.
      if ((err as Error).name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportReportPdf(opts: ExportOptions): Promise<void> {
  // Dynamic so jsPDF is code-split out of the initial bundle - see the design
  // doc's offline note for why ReportScreen also warms this chunk on mount.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const summaryEnd = drawSummary(doc, opts);

  const firstCapacity = rowsPerPage(PAGE_H - MARGIN - FOOTER_H - (summaryEnd + 14), ROW_H);
  const restCapacity = rowsPerPage(PAGE_H - MARGIN - FOOTER_H - (MARGIN + 18), ROW_H);
  const pages = paginate(opts.data.rows, firstCapacity, restCapacity);

  pages.forEach((rows, i) => {
    if (i > 0) doc.addPage();
    const heading = i === 0 ? summaryEnd + 8 : MARGIN + 6;
    drawRows(doc, rows, opts, drawTableHeader(doc, opts.strings, heading));
  });

  // Footers last, once the real page count is known.
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(opts.strings.pageOf(page, total), PAGE_W / 2, PAGE_H - 8, { align: 'center' });
  }

  await deliver(doc.output('blob'), opts.filename);
}
```

- [ ] **Step 3: Add the export button to `ReportScreen.tsx`**

Extend the imports:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../components/Toast';
import { periodSlug } from './granularity';
```

Add the prop to `ReportScreenProps`:

```tsx
export interface ReportScreenProps {
  transactions: Transaction[];
  /** accountId -> display name, built once by AppShell. */
  accountLabels: Map<string, string>;
  todayISO: string;
}
```

Destructure `accountLabels`, and add inside the component, after `report`:

```tsx
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  // The service worker caches lazily-loaded chunks only after they have been
  // fetched (public/sw.js is network-first with runtime caching), so a
  // first-ever export attempted offline would fail. Warming it on mount means
  // the chunk is almost always present by the time anyone taps Export.
  useEffect(() => {
    import('./pdf').catch(() => {});
  }, []);

  function periodLabel(): string {
    if (period.kind === 'year') return period.year;
    if (period.kind === 'month') return monthName(period.key, locale);
    return period.date;
  }

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const css = getComputedStyle(document.documentElement);
      const { exportReportPdf } = await import('./pdf');
      await exportReportPdf({
        data: report,
        accountLabels,
        categoryName,
        filename: `oeank-report-${periodSlug(period)}.pdf`,
        palette: {
          categories: [0, 1, 2, 3, 4, 5].map((i) => css.getPropertyValue(`--cat-${i}`)),
          other: css.getPropertyValue('--cat-other'),
          income: css.getPropertyValue('--income'),
          expense: css.getPropertyValue('--expense')
        },
        strings: {
          appTitle: t('appTitle'),
          periodLabel: periodLabel(),
          generatedOn: t('pdfGeneratedOn', { date: todayISO }),
          income: t('incomeLabel'),
          expense: t('expenseLabel'),
          net: t('reportNetLabel'),
          trendTitle: t('reportTrendTitle'),
          byCategory: t('reportCategoryTable'),
          transactions: t('pdfTransactions'),
          colDate: t('pdfColDate'),
          colCategory: t('pdfColCategory'),
          colNote: t('pdfColNote'),
          colAccount: t('pdfColAccount'),
          colAmount: t('pdfColAmount'),
          colShare: t('pdfColShare'),
          pageOf: (page, total) => t('pdfPageOf', { page, total })
        }
      });
    } catch {
      toast.show({ message: t('reportExportFailed'), tone: 'error' });
    } finally {
      setExporting(false);
    }
  }, [report, accountLabels, period, locale, todayISO, t, toast]);
```

Add `monthName` to the `utils/period` import. Render the button as the last child of `<section className="report">`, inside the non-empty branch — an empty document is not worth generating:

```tsx
          <button
            type="button"
            className="btn report__export"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? t('reportExporting') : t('reportExportPdf')}
          </button>
```

Add to `ReportScreen.css`:

```css
.report__export { width: 100%; min-height: 48px; }
```

Confirm `.btn` exists in `src/styles/forms.css` (`grep -n '^\.btn' src/styles/forms.css`); if the modifier used elsewhere is `btn btn--primary`, match that instead.

Also confirm the `useToast().show` signature against `src/components/Toast.tsx` — `AppShell.tsx:183` calls it as `toast.show({ message, tone: 'error', sticky: true })`, so `{ message, tone }` should be right.

- [ ] **Step 4: Pass `accountLabels` from `AppShell`**

In `src/AppShell.tsx`, update the report branch added in Task 9:

```tsx
    if (tab === 'report') {
      return (
        <ReportScreen
          transactions={transactions}
          accountLabels={accountLabels}
          todayISO={today}
        />
      );
    }
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all clean. In the build output, confirm jspdf is its **own chunk**, not folded into `index-*.js`.

Then run `pnpm dev` and check by hand:

- Export a **month** with transactions: page 1 has the title, period, totals, bar chart, ring and category table; page 2 onward lists transactions; every page has `Page n of m`.
- Export a **year**: the bar chart shows twelve months.
- Export a **single day**: no bar chart, and no gap where it would have been.
- Export a period with **more transactions than one page holds**: no rows are lost and none are duplicated at the page seam.
- Switch to Indonesian and export: all headings are translated.
- Switch to dark theme and export: the document is still black-on-white.
- Amounts and category names are not garbled (the WinAnsi assumption holds).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/features/report/pdf.ts src/features/report/ReportScreen.tsx src/features/report/ReportScreen.css src/AppShell.tsx
git commit -m "feat: export the report as a PDF"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md` (the Features list)

- [ ] **Step 1: Add the feature line**

In the **Features** section of `README.md`, after the "Spending heatmap" bullet:

```markdown
- **Reports**: scope to a year, month or day, see totals and charts, export a PDF
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: note the report page in the README"
```

---

## Self-Review

**Spec coverage.** §1 period model → Task 1. §2 architecture and `ReportData` → Task 2. §3 entry point → Task 9. §4 screen, picker, bucketing, empty state → Tasks 4, 6, 7, 8. §5 PDF (jsPDF, vector charts, palette, fonts, pages, delivery, pagination) → Tasks 3 and 10. §6 offline chunk warming → Task 10 Step 3. §7 i18n → Task 5. §8 testing → Tasks 1–4. §9 risks: five-tab fit is checked in Task 9 Step 5; the large-export pause is covered by the `exporting` button state in Task 10.

**Type consistency.** `buildReport(txns, period, locale)` is defined in Task 2 and called in Tasks 8 and 10 with that signature. `TrendBucket` fields `label`/`income`/`expense` match between `reportData.ts`, `TrendChart.tsx` and `drawTrend`. `paginate(rows, firstPageCapacity, pageCapacity)` and `rowsPerPage(usableHeight, rowHeight)` match Task 3's definitions at their Task 10 call sites. `periodSlug` is defined in Task 4 and used in Task 10. `MonthOrDatePeriod` is introduced in Task 1 and used only there.

**Known follow-through.** Task 8 defines `ReportScreenProps` without `accountLabels`; Task 10 Step 3 adds it and Task 10 Step 4 updates the caller. This is intentional — Task 8's deliverable is a reviewable read-only screen — and is called out in both tasks' Interfaces blocks.
