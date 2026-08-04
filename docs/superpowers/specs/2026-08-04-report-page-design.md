# Report Page — Design

Date: 2026-08-04

## Problem

The app answers "what did I spend" only through the lens of the transactions
screen, and that screen is built for *browsing*: a period bar, a filterable
list, and an insights panel collapsed by default. Reviewing a whole year is not
possible at all — `Period` understands a month and a single day, nothing wider
(`src/utils/period.ts:20`).

There is also no way to get anything *out* of the app. Backup exports JSON for
restoring into the app itself (`src/features/backup/backup.ts`); nothing
produces a document a person can read, keep, or hand to someone else.

## Scope

A new **Report** screen, reached from the bottom navigation, that scopes to a
year, a month or a single day and presents totals, a trend chart, a category
breakdown and a category table — plus an **Export PDF** action producing a
paginated document containing that summary and the underlying transactions.

Out of scope: custom from–to date ranges, account or category filtering within
the report, and reporting on debts, savings or allocations. The report covers
transactions, which is where income and expense live.

---

## 1. Period model

The report needs a year, so `utils/period.ts` gains a third variant rather than
the report inventing a parallel model. One period type keeps `filterByPeriod`
the single place that decides what "in view" means:

```ts
export interface YearPeriod {
  kind: 'year';
  /** 'YYYY' */
  year: string;
}

export type Period = YearPeriod | MonthPeriod | DatePeriod;
```

New functions alongside the existing ones:

```ts
export function yearKey(isoDate: string): string;              // '2026-08-04' -> '2026'
export function currentYear(todayISO: string): YearPeriod;
export function availableYears(txns: Transaction[], todayISO: string): string[];
```

`availableYears` mirrors `availableMonths` (`src/utils/period.ts:60`): every
year containing a transaction, plus the current year so a fresh sheet is not
empty, future years excluded, newest first. `filterByPeriod` gains a `year`
branch comparing `yearKey(t.date)`.

### Two call sites must be updated

Adding a variant makes two existing narrowings unsound, and TypeScript will say
so. Both are real bugs-in-waiting, not busywork:

- `Summary.tsx:25-28` returns early on `kind === 'date'`, then reads
  `period.key` — which a `YearPeriod` does not have.
- `PeriodBar.tsx:27` does the same for `selectedMonth`.

Neither component is ever handed a year period (the transactions screen never
constructs one), so the fix is to make the narrowing explicit rather than to
add year support to those components. Behaviour on the transactions screen is
unchanged.

## 2. Architecture

A self-contained feature folder, matching `features/*` elsewhere:

```
src/features/report/
  reportData.ts           pure model builder        + reportData.test.ts
  ReportScreen.tsx        the page; owns state      + ReportScreen.css
  ReportPeriodPicker.tsx  granularity + value       + ReportPeriodPicker.css
  TrendChart.tsx          SVG bars                  + TrendChart.css
  pdfLayout.ts            pagination arithmetic     + pdfLayout.test.ts
  pdf.ts                  jsPDF driver (lazy)
```

The boundaries that matter:

- **`reportData.ts` imports no React and no jsPDF.** It is a pure function of
  transactions and a period.
- **`pdf.ts` imports no React.** It takes a `ReportData` plus resolved colours,
  strings and labels, and both builds the document and delivers it (§5).
- **`ReportScreen.tsx` is the only stateful piece.**

The screen and the PDF consume the *same* `ReportData` value. Neither one
recomputes a total, so the document and the display cannot disagree.

### The model

```ts
export interface TrendBucket {
  /** Axis label: 'Jan'..'Dec' for a year, '1'..'31' for a month. */
  label: string;
  income: number;
  expense: number;
}

export interface ReportData {
  period: Period;
  totals: { income: number; expense: number; net: number };
  /** Empty when the period is a single day — see §4. */
  buckets: TrendBucket[];
  /** From buildBreakdown() — the doughnut and the table share it. */
  breakdown: Breakdown;
  /** In-period transactions, newest first, for the PDF's table. */
  rows: Transaction[];
}

export function buildReport(
  txns: Transaction[],
  period: Period,
  locale: Locale
): ReportData;
```

`locale` is needed only to name the month buckets via `Intl`. Totals come from
the existing `computeTotals` (`src/utils/summary.ts:13`) and the breakdown from
the existing `buildBreakdown` (`categoryBreakdown.ts:48`) — the report adds
bucketing and assembly, and reuses everything already proven.

## 3. Entry point

A fifth bottom-nav tab. `Tab` in `components/BottomNav.tsx:6` gains
`'report'`, `Icon` gains a `chart` glyph in the existing 24×24 stroke style,
and `AppShell` lazy-loads `ReportScreen` exactly as it does the other three
screens (`AppShell.tsx:31-33`), so a user who never opens the tab never
downloads it.

Five items on a phone-width nav bar is tight. The nav is already a flex row of
equal-width buttons with a label under each icon; the labels shrink one step at
the narrowest widths rather than the row scrolling or wrapping.

The floating **+** button stays gated to the transactions tab
(`AppShell.tsx:490`) — nothing is added from the report.

## 4. The screen

```
┌─ Report ──────────────────────────┐
│ [ Year ][ Month ][ Day ]           │  granularity toggle
│ ▾ 2026                             │  value picker
├────────────────────────────────────┤
│  Income      Expense      Net      │  totals
├────────────────────────────────────┤
│  ▁▃▂▅▇▃▁  income vs expense        │  trend chart
├────────────────────────────────────┤
│  ◕  doughnut + legend              │  SpendingDoughnut, reused as-is
├────────────────────────────────────┤
│  Category      Amount        %     │  category table
├────────────────────────────────────┤
│         [ Export PDF ]             │
└────────────────────────────────────┘
```

### Period picker

Three buttons choose the granularity; the control beneath changes with it:

| Granularity | Control                                              |
|-------------|------------------------------------------------------|
| Year        | `<select>` over `availableYears`, newest first        |
| Month       | `<select>` over `availableMonths`, `monthName` labels |
| Day         | `<input type="date">`, `max={todayISO}`               |

Switching granularity keeps the user near where they were rather than resetting
to today: Year→Month lands on the latest available month *within* that year,
Month→Day on the first of that month, Day→Month on that day's month,
Month→Year on that month's year. Landing somewhere unrelated after a single tap
is the thing to avoid.

The picker does **not** reuse `PeriodBar`. That component is built around
this-month/last-month shortcuts and a hidden day input designed for the
transactions screen's layout (`PeriodBar.tsx:67-75`); the report wants a plain
granularity switch. Sharing the `Period` type is the reuse that pays; sharing
the widget would mean bending one control to two jobs.

### Trend chart

`TrendChart.tsx` renders paired income/expense bars per bucket as inline SVG
with CSS-variable fills, in the same hand-rolled style as `SpendingDoughnut`
and `SpendingHeatmap`. Bar heights scale to the largest single value across
both series so the two are directly comparable.

Bucketing rules, which are the non-obvious part:

- **Year** → 12 monthly buckets, *always all twelve* including empty months, so
  the axis means the same thing in every year and a sparse year reads as sparse
  rather than as a short chart.
- **Month** → one bucket per day of *that* month: 28, 29, 30 or 31, computed
  from the month itself so February and leap years are right.
- **Day** → a single bar is not a chart. `buckets` is empty and the section is
  omitted; totals, doughnut and table still render, and the PDF drops the chart
  block rather than leaving a gap.

### Empty periods

Zeroed totals, the existing `breakdownEmpty` copy for the doughnut, an empty
state for the table, no chart, and the Export button disabled — an empty
document is not worth generating.

## 5. PDF export

### Dependency

`jspdf`, added as the third runtime dependency and imported dynamically inside
the export handler so it is code-split out of the initial bundle:

```ts
const { jsPDF } = await import('jspdf');
```

`html2canvas` is **not** added. Both charts are drawn with jsPDF's own vector
primitives, which is less code than rasterising and produces sharp output at
any zoom:

- **Bars** — `doc.rect()` per bar. Trivially direct.
- **Doughnut** — jsPDF has no arc primitive, but a ring segment is exactly a
  polyline sampled along the arc and stroked with `lineWidth` set to the ring
  thickness. Sampling every 2° is visually indistinguishable from a true arc.

This also sidesteps the trap in the obvious alternative: serialising the live
`<svg>` would drop its colours, because they come from CSS classes resolving
`var(--cat-N)` (`SpendingDoughnut.css:6-12`) and an external stylesheet does not
travel with a serialised node.

### Colours and fonts

The palette is read once from the document root, so the PDF matches the theme
the user actually has:

```ts
const css = getComputedStyle(document.documentElement);
const palette = [0,1,2,3,4,5].map((i) => css.getPropertyValue(`--cat-${i}`).trim());
```

Ink and page background are **forced to the light-theme values** regardless of
the active theme. Paper is white; a dark-theme document would print as a black
rectangle.

Fonts stay with jsPDF's built-in Helvetica. English, Indonesian and
`Rp 1.250.000` are entirely within WinAnsi, so no font is embedded — a Unicode
font would cost several hundred kilobytes and dwarf jsPDF itself.

### Document

A4 portrait, millimetre units.

**Page 1** — app name and period label, "generated on" date, the totals block,
the trend chart, the doughnut, then the category table (name, amount, share).

**Page 2 onward** — the transactions table: date, category, note, account,
amount. Account names come from the `accountLabels` map `AppShell` already
builds (`AppShell.tsx:139`). Long notes are truncated to the column width
rather than wrapped, so every row is one line and the row arithmetic stays
exact. Each page repeats a compact header and carries a `page n / m` footer.

**Filename** — `oeank-report-2026.pdf`, `oeank-report-2026-08.pdf`, or
`oeank-report-2026-08-04.pdf`.

**Delivery** — `doc.save(filename)`. When `navigator.canShare` reports support
for files, the blob is offered through the Web Share API instead, which is the
path that works in an installed iOS PWA where an anchor download is unreliable.

### Pagination

`pdfLayout.ts` holds the arithmetic as pure functions so it can be tested
without asserting on PDF bytes:

```ts
export function rowsPerPage(usableHeight: number, rowHeight: number): number;
export function paginate<T>(rows: T[], firstPageCapacity: number, pageCapacity: number): T[][];
```

`pdf.ts` then walks the returned chunks, calling `addPage()` between them. The
first page has a smaller capacity than the rest because the summary sits above
the table — which is exactly the off-by-one this split exists to make testable.

## 6. Offline behaviour

Worth stating plainly, because it is the one place this feature is weaker than
the rest of the app.

`public/sw.js` is network-first with *runtime* caching, and `PRECACHE_URLS`
lists only `/`, `/index.html` and the font (`public/sw.js:16`). A lazily
imported chunk is therefore cached only once it has been fetched — so a
first-ever export attempted offline would fail.

Mitigation: `ReportScreen` fires `import('jspdf')` on mount and ignores the
promise, warming the chunk as soon as the user visits the tab while online. The
initial bundle is unaffected either way, and by the time anyone taps Export the
chunk is almost always already there. A failed import surfaces through the
existing toast path (`AppShell.tsx:181`).

Adding the chunk to `PRECACHE_URLS` is not an option: its filename is content-
hashed at build time, and the service worker is a static file in `public/`.

## 7. Internationalisation

Every string goes through `t()`. New keys in both `en` and `id`
(`src/i18n/translations.ts`) — the `Record<TranslationKey, string>` annotation
makes a missing Indonesian string a compile error:

`navReport`, `reportTitle`, `reportGranularityLabel`, `reportYear`,
`reportMonth`, `reportDay`, `reportPickYear`, `reportNetLabel`,
`reportTrendTitle`, `reportTrendIncome`, `reportTrendExpense`,
`reportCategoryTable`, `reportTableAmount`, `reportTableShare`,
`reportEmpty`, `reportExportPdf`, `reportExporting`, `reportExportFailed`,
`pdfGeneratedOn`, `pdfTransactions`, `pdfPageOf`, `pdfNote`, `pdfAccount`.

The month and day pickers reuse the existing `periodPickMonth` and
`periodPickDay` labels rather than adding report-specific duplicates of the
same words.

The PDF is generated in the language currently selected in the app.

## 8. Testing

Pure logic is unit-tested with Vitest, matching the repo's existing split.

**`reportData.test.ts`**
- Year: twelve buckets in order, empty months present with zeroes, transactions
  from other years excluded.
- Month: 31-day, 30-day, February 2026 (28), February 2024 (29).
- Day: `buckets` is empty; totals and breakdown still populated.
- Totals equal `computeTotals` over the same filtered set.
- `rows` newest first.
- Empty period: zeroed totals, empty breakdown, empty rows.

**`period.test.ts`** (extending the existing file)
- `filterByPeriod` with a year period; year boundaries (Dec 31 / Jan 1).
- `availableYears`: includes the current year on an empty list, excludes future
  years, newest first, no duplicates.

**`pdfLayout.test.ts`**
- `paginate`: zero rows, exactly filling the first page, overflowing by one,
  several full pages, first-page capacity differing from the rest.

jsPDF's byte output is not asserted. It is verified once by generating a
document by hand and reading it.

## 9. Risks

- **Five nav tabs on a narrow phone.** Checked at 320px during implementation;
  if labels cannot fit legibly the fallback is icon-only for all five, not a
  scrolling row.
- **A very large year export.** A year with thousands of transactions produces
  a long PDF and a noticeable synchronous generation pause. Accepted: the
  button shows a working state while generating, and truncating a document the
  user explicitly asked for would be worse than making them wait.
