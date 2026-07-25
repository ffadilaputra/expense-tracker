# Personal Finance Manager — Design

**Date:** 2026-07-25
**Status:** Approved, ready for implementation planning
**Base:** Ported from the `recipe-app` project (offline-first Google-Sheet-backed PWA)

## Summary

A responsive, offline-first personal finance tracker built on the recipe-app
engine. It is one screen — a balance summary, a GitHub-style spending heatmap,
and a date-grouped transaction list — plus a standout floating action button
(FAB) that opens an Add/Edit form. Amounts are Indonesian Rupiah (IDR). The UI
supports English and Bahasa Indonesia. All data lives in a **Google Sheet the
user owns**, accessed via a Google Apps Script web app URL, and cached on the
device so the app works with no connection.

The durability thesis is inherited unchanged: there is no account and no server
holding the data. The Sheet *is* the store and the backup. Success is that a
transaction entered years ago is still there and still readable on a new device.

## Goals (v1)

- Log income and expense transactions quickly, offline, on a phone.
- See current balance and this-month income/expense at a glance.
- See spending intensity over time as a calendar heatmap.
- Store everything in a user-owned Google Sheet, synced when online.
- Work equally well on mobile and desktop.

## Non-goals (v1, explicitly deferred)

- Accounts / balances per account (Cash, Bank, e-wallet).
- Budgets, budget alerts, recurring transactions.
- Charts beyond the heatmap (pie/line/dashboard).
- Multi-currency. IDR only.
- Public share links (dropped from recipe-app — finance data is private).
- In-app JSON backup/export. The Google Sheet is the backup.

## Architecture: reuse vs. rewrite

The recipe-app is two layers: a **generic offline-first sync engine** and a
**recipe-specific domain**. We keep the first and swap the second.

### Reused nearly as-is (rename only)

- Build tooling — Vite + React 18 + TypeScript, `tsconfig`, PWA setup, Netlify config.
- `App.tsx` — login gate (connect a Sheet URL) + "change sheet" flow.
- Offline engine — `localCache` (cache + sync queue + local-id helpers),
  `useOnlineStatus`, `usePullToRefresh` + `PullToRefreshIndicator`.
- `SyncStatus` component and the `Toast` component.
- `InstallPrompt` + `useInstallPrompt` (PWA "add to home screen").
- i18n system — `i18n/context`, `i18n/translate`, `i18n/locale`, `LanguageSwitch`
  (EN/ID). New strings, same machinery.
- `sheetApi.ts` fetch/CORS pattern (text/plain to avoid preflight, envelope
  parsing, boundary coercion) and the Apps Script `Code.gs` (columns change,
  request/response logic does not).

### Rewritten for finance

- `types.ts` → `Transaction` replaces `Recipe`.
- `useRecipeStore` → `useTransactionStore` — same optimistic-queue logic
  (add/update/delete, `_pending` flag, queue persisted to localStorage,
  auto-retry on reconnect, push-then-pull refresh), new payload shape.
- Components:
  - `TransactionList` + `TransactionCard` (replace `RecipeList`/`RecipeCard`).
  - `TransactionForm` (replaces `RecipeForm`).
  - `Summary` — balance + this-month income/expense totals (new).
  - `SpendingHeatmap` — GitHub-style calendar heatmap (new).

### Dropped from the port

- `SharedRecipeView`, `share/shareLink`, `share/shareImage`, and the Netlify
  edge function share path — finance data is private, so the whole public-share
  machinery goes away.
- `CameraCapture` — not relevant.
- `BackupPanel` + `offline/backup.ts` — no in-app JSON export/import in v1.
  The "change sheet" control it hosted moves to the List header (see Navigation).
- `offline/publicRecipes.ts`, `offline/migrate.ts` recipe-specific bits (a fresh
  cache key is used; no legacy migration needed for a new app).

## Data model

```ts
interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;          // IDR, integer (no decimal subunit)
  category: string;
  date: string;            // ISO yyyy-mm-dd (the transaction date, user-chosen)
  note?: string;
  createdAt: string;       // ISO timestamp, set on creation
  _pending?: boolean;      // true while unsynced to the Sheet (reused pattern)
}

type TransactionFormData = Omit<Transaction, 'id' | 'createdAt' | '_pending'>;
```

The Google Sheet has one **Transactions** tab with columns:
`id | type | amount | category | date | note | createdAt`.

### Categories

Preset **plus** custom. A `config/categories.ts` constant holds defaults:

- **Expense:** Food, Transport, Bills, Shopping, Health, Entertainment.
- **Income:** Salary, Bonus, Gift.

The form's category input is a `<datalist>` filtered by the selected type, so
the user picks a preset or types a new category on the fly.

## Amount handling

The one genuinely new concern vs. recipe-app (which stored everything as
strings). A dedicated `utils/money.ts` is the single source of truth:

- `formatIDR(n: number): string` → `"Rp 1.250.000"` (thousands separator `.`).
- `parseAmount(input: string): number` → integer, stripping formatting.
- The Add form displays the value formatted as the user types while storing the
  raw integer.
- `sheetApi` coerces the `amount` cell with `Number(...)` and guards `NaN` at the
  boundary (Sheets returns numbers as JS numbers, which is what we want here),
  so a malformed cell can never crash the list or summary.

## Screens & navigation

The app is effectively **one screen** plus an Add/Edit form.

### Home (List) screen, top to bottom

1. **Header** — `SyncStatus` line and a small `⋯` "change sheet" control
   (relocated from the removed Backup panel; disconnects the current Sheet and
   returns to the login screen, reusing `App.tsx`'s existing change-sheet flow).
2. **Summary** — current balance (all-time income − expense), plus this-month
   income (↑) and this-month expense (↓) totals. Always visible; the numbers are
   the content.
3. **SpendingHeatmap** — see below.
4. **TransactionList** — grouped by date (Today / Yesterday / explicit date),
   newest first. Each row: category + note on the left, signed amount on the
   right (expense muted/red-ish, income green-ish, kept restrained). `_pending`
   rows carry the same subtle "not synced" marker as recipe-app. Tapping a row
   opens it in the form for editing.

### Add / Edit form

Opened by the FAB (add) or by tapping a row (edit). Fields, in order:

1. Segmented **income / expense** toggle.
2. **Amount** — numeric, IDR-formatted as typed.
3. **Category** — datalist (presets for the selected type + free text).
4. **Date** — defaults to today.
5. **Note** — optional.

Saving returns to the list. Editing reuses the same component seeded with the
transaction's values.

### Primary action — FAB

The equal tab bar is dropped. The List is the home screen; **Add** is a
prominent **floating action button**: circular, filled with the single accent
color on the otherwise restrained black-and-white surface, fixed bottom-right of
the content column, with a soft shadow so it lifts off the list. It is the one
loud element on the screen — consistent with recipe-app's rule that only one
thing has a real claim to attention.

## Spending heatmap

A calendar grid of small squares — columns are weeks, rows are the 7 weekdays —
where each square's shade encodes **that day's total expense**. Darker = more
spent. It is the "where did the money go" glance, the finance analog of GitHub's
contribution chart.

- **Metric:** daily expense total. Income does not shade the grid (keeps it a
  clean single hue).
- **Buckets:** 5 levels — level 0 (no spend, faint base square) plus four
  nonzero bands from quantile-style thresholds of daily spend — rendered with one
  theme-aware sequential color scale (restrained, not GitHub-green-loud).
- **Range:** last ~26 weeks (~6 months). Horizontally scrollable on mobile,
  auto-scrolled to today on load. Full range fits without scroll on desktop.
- **Interaction:** tapping a day filters the transaction list below to that day
  (tap again, or a "clear" affordance, resets); the day's total shows on tap. The
  chart doubles as a navigation control, not decoration.
- **New unit:** a pure `utils/heatmap.ts` buckets transactions into
  `{ date, total, level }[]`, testable in isolation, feeding a presentational
  `SpendingHeatmap` component. It reuses `money.ts` for formatting.

## Responsive layout

A single centered column at all sizes — not a dashboard sprawl — scaled up and
using extra width only where it helps. Hand-written CSS in `index.css` with a
small number of breakpoints (`min-width: 640px`, `1024px`); no CSS framework,
matching recipe-app.

| Area | Mobile (< 640px) | Desktop / tablet (≥ 640px) |
|---|---|---|
| Container | full-width, edge padding | centered column, `max-width ~720px`, larger gutters |
| Summary | balance stacked over income/expense | one row, larger type |
| Heatmap | ~26 weeks, horizontally scrollable | full range fits without scroll, slightly larger cells |
| Transaction row | category+note left, amount right | same, more horizontal breathing room |
| Add / Edit form | full-screen view | centered modal dialog over the list, ~480px wide |
| Primary action | FAB bottom-right | FAB bottom-right of the column **and** a header "+ Add" button |

Constraints: relative units, `max-width: 100%` on the scrollable heatmap so the
page body never scrolls horizontally, touch-sized targets on all viewports. The
FAB and modal form are the same component; only the container styling changes at
the breakpoint (full-screen vs. centered dialog).

## Sync & error handling

- **Sync:** identical engine to recipe-app — optimistic add/update/delete, the
  `_pending` flag, a queue persisted to localStorage, automatic retry when
  connectivity returns, and manual pull-to-refresh. Refresh pushes local changes
  then pulls the Sheet (push-first so the refresh already includes what was
  queued). Only the payload type changes (`Transaction` instead of `Recipe`).
- **Errors:** the same non-alarming approach — a `Toast` plus an inline error
  line. Offline is a normal, shown-not-warned state. Bad-amount / `NaN` values
  are guarded at the `sheetApi` boundary so a malformed Sheet cell cannot crash
  the list or summary.

## Testing

- `utils/money.ts` (`formatIDR`, `parseAmount`) — unit tested. Pure and the
  highest-risk new logic (formatting/parsing round-trips, separators, edge values).
- `utils/heatmap.ts` (bucketing into `{ date, total, level }`) — unit tested.
  Pure; covers empty ranges, threshold boundaries, and day grouping.
- The sync/store logic is ported verbatim from working recipe-app code, so it is
  covered by manual offline smoke-testing: add a transaction offline, reconnect,
  and confirm it lands as a row in the Google Sheet.

## Localization

- Currency: IDR, formatted `Rp 1.250.000` via `money.ts`.
- Languages: English and Bahasa Indonesia, via the reused i18n system. All new
  UI strings (summary labels, form fields, categories UI, heatmap legend, empty
  states) get EN and ID entries. Category preset *values* are stored as typed;
  their display can be localized later if needed (out of scope for v1).
```
