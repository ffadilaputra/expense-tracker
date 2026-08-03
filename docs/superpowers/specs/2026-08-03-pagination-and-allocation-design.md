# Transaction Pagination and Money Allocation — Design

Date: 2026-08-03

## Problem

Two unrelated complaints about the transactions screen, solved together because
they land in the same block of markup.

**The list has no ceiling.** A busy month renders every one of its transactions
as a card, all at once. Nothing paginates, so the cost of opening the app grows
with how diligently it has been used.

**There is no way to budget.** The app records what happened and tracks goals
(`Savings`) and obligations (`Debts`), but offers nothing for deciding what
*should* happen — no daily allowance, no weekly envelope, no answer to "can I
spend this".

## Scope

Pagination of the transaction list, and a new `Allocation` entity implementing
envelope budgeting with a recurring refill rule and rollover.

Out of scope: the backup format. `importBackup` carries transactions, accounts
and transfers only — debts and savings are already absent, so adding allocations
alone would be a partial fix pretending to be a whole one. All four want a
single later pass.

---

# Part 1 — Pagination

## A refactor first

`AccountsScreen`, `DebtsScreen` and `SavingsScreen` each exist as their own
component. The transactions screen does not: it is inlined in `AppShell.tsx`
(lines 459–494), in a file already 758 lines long holding ten modals.

Extract it to `src/features/transactions/TransactionsScreen.tsx`, matching the
three screens that already exist. Both features in this document land inside
that block, so this is not speculative tidying — it is making room where the
work happens, and it returns `AppShell` to being a shell.

## Behaviour

Pagination applies **within the active period**, not across it. The period bar
remains the primary time filter; paging is what keeps a heavy month from
rendering at once. The list shows 30, and a **Load more** button appends the
next 30, growing downward.

Growing rather than replacing matters for date grouping: `TransactionList`
groups whatever it receives (`TransactionList.tsx:28`), so a partially revealed
day shows once with fewer rows and simply extends when more load. Numbered
pages would split a single day across a boundary and print its heading twice.

## Module

`src/features/transactions/pagination.ts`:

```ts
export const PAGE_SIZE = 30;

export interface Page<T> {
  rows: T[];         // items.slice(0, pages * PAGE_SIZE)
  remaining: number; // how many are still hidden
  hasMore: boolean;
}

export function pageSlice<T>(items: T[], pages: number): Page<T>;
```

`rows` never exceeds `items`, and `remaining` never goes below zero, so a `pages`
count past the end degrades to "everything, nothing hidden" rather than
producing a negative count in the button label.

Pure, with its own test file. This repo tests pure modules and has no component
tests, so keeping the logic out of the component is what makes it testable at
all — the same reasoning that put `dateGroups.ts` and `categoryChips.ts` in
their own files.

## Wiring

`TransactionsScreen` holds `const [pages, setPages] = useState(1)`. The existing
chain — period → category → `visible` — is untouched, and the slice applies last,
immediately before `TransactionList`.

`pages` resets to 1 whenever the period or the category changes, through setter
wrappers, synchronously. Not via an effect: `setPeriod` already reconciles the
category filter this way (`AppShell.tsx:163-173`) precisely to avoid rendering
one frame of the wrong state.

The button reads "Load more (112 remaining)" — two new i18n keys, English and
Indonesian — and renders only when `hasMore`.

## What pagination does not touch

The period bar, summary, trend message, spending chart and heatmap all keep
reading the full, unsliced period data. Paging is a rendering concern for the
list alone. Totals must not change because the user has not scrolled.

---

# Part 2 — Money Allocation

## Model

An allocation is an **envelope**: a named pot, claiming one or more spending
categories, refilled automatically on a cadence, drawn down by real expenses,
with the leftover rolling forward.

Funding is an earmark, never a movement — the same principle `SavingContribution`
already establishes (`types.ts:102`). Creating an envelope moves no money and
writes no transaction.

Four decisions define the shape, and each one removes machinery:

| Decision | Consequence |
|---|---|
| Categories drive attribution | No `allocationId` column on Transactions, no extra field in the transaction form, and existing history becomes attributable the moment an envelope is created |
| Refill is a recurring rule | No funding rows. One sheet row per envelope, forever; every period is derived. A daily envelope funded by hand would need 365 taps a year |
| Leftover rolls over | Available accumulates across periods, so an underspent day raises tomorrow |
| Editing rebases | Changing the amount snapshots the current balance and restarts the clock, instead of retroactively rewriting every past period |

```ts
export type AllocationCadence = 'daily' | 'weekly' | 'monthly' | 'days';

export interface Allocation {
  id: string;
  name: string;
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

## Sheet tab

`Allocations`: `id, name, icon, amount, cadence, intervalDays, categories,
startDate, openingBalance, note, createdAt`. Created on demand by `getSheetFor`,
like every other tab.

`categories` is written as a JSON array in one cell. `normalizeAllocation`
accepts that, and falls back to splitting on commas when someone hand-edits the
cell to `Food, Groceries`, then trims and drops blanks. Defensive coercion is
the stated job of `normalize.ts` (see its header comment), and it matters more
here than for scalar fields: this value is a list, so a malformed cell would
otherwise silently unclaim categories and quietly inflate the envelope.

## One category, one envelope

The form disables any category another envelope already claims, naming the
owner, so the rule is enforced where the mistake would be made.

The computation independently takes the **first** matching envelope. A sheet
hand-edited into a conflict therefore under-counts rather than charging one
expense against two budgets — the failure that is merely wrong, not the failure
that is wrong twice.

## What draws an envelope down

Expenses only.

- **Income in a claimed category is ignored.** An envelope is a spending
  allowance; netting a refund into it would make "left today" jump for a reason
  the user did not act on.
- **Transfers never touch envelopes.** Moving money between one's own accounts
  is not spending.
- **`accountId` is irrelevant.** An envelope budgets a purpose, not a wallet, so
  it spans every account.

## Computation

Pure, in `src/features/allocations/allocations.ts`, shaped like `savings.ts` and
`debt.ts`.

**Period boundaries.** `daily`, `weekly` and `days` are all "every N days"
(1, 7, `intervalDays`) counted from `startDate`. `monthly` is calendar months
anchored to `startDate`'s day-of-month, with the anchor clamped to the last day
of shorter months — an envelope started on the 31st begins its February period
on the 28th or 29th, never in March. Day arithmetic goes through `Date.UTC`,
matching how `period.ts:47` already sidesteps timezones and DST.

Monthly exists because the rest of the app is month-scoped: the period bar
defaults to the current month and the summary reports monthly totals. Serving
"Rp 2.000.000 for Food this month" as "every 30 days" would drift out of step
with the numbers sitting beside it on screen.

**The core figures:**

```
periodsElapsed = number of period-starts on or before today  (1 on the start date itself)
granted        = openingBalance + periodsElapsed × amount
spent          = expenses in claimed categories, startDate ≤ date ≤ today
available      = granted − spent        // may go negative
```

That is the rollover, and it is why nothing per-period is stored.

`spentThisPeriod` is the same sum narrowed to the current period —
expenses in claimed categories with `periodStart ≤ date ≤ min(today, periodEnd)`.

A category matches by exact string equality after trimming. Categories are free
text in this app, so `Food` and `food` are two different categories, and an
envelope claiming one does not claim the other. Matching loosely would be a
guess about the user's intent that the category chips never made.

```ts
export interface AllocationSummary {
  periodStart: string;
  periodEnd: string;       // inclusive
  periodsElapsed: number;
  granted: number;
  spent: number;
  available: number;       // headline figure; negative when overdrawn
  spentThisPeriod: number;
  periodRemaining: number; // amount − spentThisPeriod
  isOverdrawn: boolean;
}
```

The card leads with `available` — the pot actually accumulated — and shows
`spentThisPeriod` against `amount` beneath it. Two different questions, both
worth answering: what is in the pot, and how today is going.

**Future-dated expenses do not count** until their date arrives (`date ≤ today`).
An expense dated for next week has not happened, and this matches
`availableMonths` (`period.ts:60`) already refusing to navigate into the future.

## Rebase on edit

A pure `rebase(allocation, transactions, todayISO)` returns
`{ openingBalance: available, startDate: todayISO }`. The edit handler calls it
and folds the result into the form before saving, so the store stays unaware and
the rule lives with the rest of the maths.

It fires when **`amount`, `cadence`, `intervalDays`, or `categories`** change.
Editing only the name, icon or note changes nothing and rebases nothing.

`categories` belongs in that list for the same reason `amount` does. Because
`available` is computed from `startDate`, adding *Groceries* to an envelope that
had claimed only *Food* would let months of past grocery spending retroactively
drain a pot the user had been running successfully. Both fields rewrite history
if left alone; both are rebased.

The alternative — recomputing retroactively — is a trap. Raising a daily
allowance from 50k to 60k on an envelope 200 days old would silently grant
Rp 2.000.000 of rollover that never existed, at exactly the moment the number
most needs to be trustworthy.

## Unallocated

The Summary card gains one line: `balance − Σ max(0, available)`.

Each envelope is clamped at zero before summing, because an overdrawn envelope
holds no money. That spending has already left the balance, so counting it as a
negative claim would report *more* free cash than exists. The same instinct
clamps `remainingAmount` in `savings.ts:46`.

The figure still goes negative when the envelopes together promise more than is
held — which is the single most useful warning this feature can produce.

The line renders only when at least one envelope exists, so anyone not using the
feature sees the Summary card exactly as it is today.

## Components

All under `src/features/allocations/`, mirroring the savings folder:

| File | Role |
|---|---|
| `allocations.ts` + `allocations.test.ts` | The maths above |
| `AllocationsStrip.tsx` + `.css` | Horizontal card scroller on the transactions screen |
| `AllocationCard.tsx` + `.css` | One envelope: icon, name, `available`, this period's progress |
| `AllocationDetail.tsx` + `.css` | Modal — breakdown, edit, delete |
| `AllocationForm.tsx` | Create / edit |

`AllocationDetail` and `AllocationForm` are `lazy()`-loaded from `AppShell`
alongside the other nine modals, so a user who never opens one never downloads
them.

**Placement:** `PeriodBar → Summary → AllocationsStrip → SavingsStrip →
SpendingTrendMessage → SpendingChart → CategoryFilter → TransactionList`.

Envelopes sit above savings goals because "what can I spend today" is the
question the app is opened to answer; a goal is something checked on.

**No new tab.** The bottom nav already carries four. The value of an envelope is
the at-a-glance remaining balance, which belongs on the landing screen; the
management surface — created once, edited rarely — is what a modal is for, and
`SavingDetail` establishes that shape. Savings arguably earned its tab because
goals have history worth browsing; an envelope is a running number.

**The strip always renders**, unlike `SavingsStrip`, which returns `null` when
empty (`SavingsStrip.tsx:26`). This break is structural, not stylistic: savings
can be created from the Savings tab, but allocations have no tab, so the strip
is the only entry point and cannot hide when there is nothing yet. With
envelopes it shows cards plus a trailing "add" card; with none it collapses to a
single slim "Set an allocation" row. Both open `AllocationForm` in `'new'` mode;
tapping an envelope card opens `AllocationDetail` for that envelope. Burying
creation in the `⋯` menu beside Backup and Change Sheet would make the feature
undiscoverable.

**Form fields:** name, optional emoji, amount, cadence (Daily / Weekly / Monthly
/ Every N days), `intervalDays` shown only for the last, categories, optional
note. Category chips already claimed by another envelope render disabled with
the owner's name.

`startDate` appears **only when creating**, defaulting to today but settable so
an envelope can start from the 1st. On edit it is hidden, because rebase owns
it — offering a date field that a rebase then overwrites would be a plain lie.

**Detail modal:** the available balance, the current period window in plain
language ("Today", "1–7 Aug", "August"), the `granted` / `spent` breakdown, this
period's progress, the claimed categories, and the last ten expenses drawing it
down. That list is what turns "I am Rp 40.000 over" into "because of Friday".
Edit and Delete live here; Delete confirms, matching `handleSavingDelete`
(`AppShell.tsx:270`).

All new strings get English and Indonesian entries in `translations.ts`. No new
`Icon` glyphs are needed — cards use the envelope's own emoji.

## Offline and sync

Allocations follow the savings path exactly, so there is nothing novel:

- **Add** creates a `makeLocalId()` row with `_pending: true` and queues
  `{ entity: 'allocation', type: 'add' }` (`useFinanceStore.ts:756`).
- **Update** folds into a still-unsynced add rather than queueing a second
  operation (`useFinanceStore.ts:779`).
- **Delete** drops queued entries for that id and queues a `delete` only if the
  row ever reached the sheet (`useFinanceStore.ts:799-806`). Envelopes own no
  child rows, so nothing cascades.
- **Merge** gains an `allocById` map in `mergeRemote`, plus `persistAllocations`.
- **Failed changes** need no new UI — `SyncStatus` already offers retry and
  discard.

`'allocation'` joins `SyncEntity`; `finance:allocations` joins `localCache`,
including `clearCache`; `addAllocation` / `updateAllocation` / `deleteAllocation`
join `sheetApi.ts`, `useFinanceStore`, and `Code.gs`.

## Apps Script

`Code.gs` gains `ALLOCATIONS_SHEET` and its headers, `allocationRowToObject`,
the three handlers, three `doPost` routes, and `allocations` in the `list`
payload. `getSheetFor` creates the tab on first use and adds missing columns on
redeploy — the upgrade path the README already promises.

**Old deployments degrade rather than break.** `fetchAll` reads
`raw.allocations ?? []`, so a user who has not pasted the new `Code.gs` sees an
app with no envelopes instead of an error — the same tolerance `fetchAll`
already extends to pre-accounts deployments (`sheetApi.ts:71-76`). Writes will
fail there and land in the failed-changes queue carrying the script's own error,
which is the honest outcome: the sheet genuinely cannot store them yet. The
README gains an `Allocations` row so the redeploy is documented.

## Validation

The form blocks an amount ≤ 0, an empty category list, and `intervalDays` < 1.
Progress bars guard `amount > 0` before dividing, as `summarizeSaving` guards its
target (`savings.ts:42-47`), so a zero hand-typed into the sheet renders an empty
bar rather than `NaN`.

---

# Testing

This repo tests pure modules with Vitest and has no component tests. The logic
lives in pure modules so that it can be covered.

**`pagination.test.ts`** — exact multiples, fewer items than one page, zero
items, `remaining` and `hasMore` at the final boundary, and a page count past the
end.

**`allocations.test.ts`** — the bulk of the work:

- `periodsElapsed` for all four cadences; the start date itself counts as period 1
- monthly anchoring: the 31st clamping into February, and a leap year
- rollover accumulating, `openingBalance` carried in, `available` going negative
  on overdraft
- `spent` ignoring income, future-dated rows, and anything before `startDate`
- the first-match guard when a hand-edited sheet has two envelopes claiming one
  category
- `rebase` returning today's date and the current available balance
- unallocated summing with each envelope clamped at zero

**Verification before the work is called done:** `pnpm typecheck`, `pnpm test`,
`pnpm build`, then running the app to exercise both features for real.
