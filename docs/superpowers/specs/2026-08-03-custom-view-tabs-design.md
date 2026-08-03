# Custom View Tabs and a Shorter Transaction Page — Design

Date: 2026-08-03

## Problem

**No way to save a filter.** The category chip row filters by one category at a
time and forgets the choice whenever the period changes. There is no way to ask
"what did daily needs cost me this month?" without re-picking categories, and no
way to express a group of categories at all.

**The page has grown long.** The transactions screen now stacks eight sections —
period bar, summary, allocations strip, savings strip, trend message, spending
chart, category chips, list — so the first transaction sits below roughly a
screen and a half of everything else. Transactions are the reason the app is
opened; they are currently eighth in line.

## Scope

Two changes to the same screen, specified together because they interact: the
view tab bar adds a section, and the layout work has to know it exists.

Out of scope: syncing views to the Google Sheet. Views are device-local
preferences (see "Storage"). No `Code.gs` change and no redeploy.

---

# Part 1 — View Tabs

## What a view is

A **named, reusable, multi-category filter** — the thing the chip row cannot
express. The chips stay: they need no setup and adapt to whatever is in the
current month, which is exactly what a new user wants before they have curated
anything.

```ts
export type ViewType = 'all' | 'expense' | 'income';

export interface View {
  id: string;
  name: string;
  /** Empty = every category of `type`. */
  categories: string[];
  type: ViewType;
}

export const ALL_VIEW_ID = 'all';
```

`{ name: 'Daily needs', categories: ['Food', 'Transport'], type: 'expense' }`.

**Empty categories means "everything of this type."** This is the rule that
earns the model its keep: an "Income" view is `[]` + `income`, and it keeps
working when a new income category is invented next month. Listing categories
explicitly would mean going back to tick each new one.

A category is not unique on its own — `categoryChips.ts:8` treats a chip as a
*(category, type)* pair precisely because "Gift" can be both an income and an
expense. Carrying `type` beside the list resolves that without forcing the user
to think in pairs, which a set-of-pairs model would.

## The All tab is synthesized, not stored

A constant with `id: 'all'`, rendered by the tab bar as `t('filterAllLabel')`
rather than a stored name. It therefore cannot be renamed, deleted, or
corrupted, needs no migration for a user who has no views, and leaves nobody
stranded looking at nothing after deleting their last view.

## Storage

Two modules, split the way the theme feature already splits — pure logic in the
feature folder, localStorage access in `config/`:

| Module | Holds |
|---|---|
| `src/features/transactions/views.ts` | `View`, `ViewType`, `ALL_VIEW_ID`, `ALL_VIEW`, `applyView`, `normalizeView`, `makeViewId` |
| `src/config/viewPrefs.ts` | `loadViews`, `saveViews`, `loadInsightsOpen`, `saveInsightsOpen` |

```ts
export const ALL_VIEW: View = { id: ALL_VIEW_ID, name: '', categories: [], type: 'all' };

export function applyView(txns: Transaction[], view: View): Transaction[];
/** null for anything malformed; the caller drops it. */
export function normalizeView(raw: unknown): View | null;
export function makeViewId(): string;
```

`makeViewId` returns `view-${Date.now()}-${random}`, mirroring `makeLocalId`
(`offline/localCache.ts:107`) without importing it — that helper marks rows the
sync queue has yet to push, and a view never reaches the sheet. `crypto.randomUUID`
is avoided because it requires a secure context, which a plain-HTTP local build
would not have.

`ALL_VIEW.name` is empty on purpose: the tab bar renders `t('filterAllLabel')`
for `ALL_VIEW_ID`, so the label follows the user's language instead of freezing
whichever one was active when it was created.

Device-local, like `theme.ts` and `locale.ts`. A view is a name plus a handful
of category strings; recreating three on a second device is a minute of typing,
whereas syncing would cost a seventh sheet tab, another queue entity, and
another `Code.gs` redeploy. The honest cost: iOS can evict storage for web apps
left unused, so views are not guaranteed permanent. If that bites, the storage
module is the only thing that changes.

`normalizeView` returns `null` for anything malformed and `loadViews` drops the
nulls. localStorage is the one input the user can hand-edit and that survives
across app versions, so a bad entry has to degrade to "that view is gone"
rather than taking the tab bar down with it.

## Matching

Exact string equality after trimming, reusing the `UNCATEGORIZED` sentinel from
`categoryChips.ts:19` so a view can deliberately claim uncategorized rows. This
requires exporting that module's private `normalize` helper — a one-line change,
and the alternative is two subtly different definitions of what a category is.

**A view whose categories no longer exist matches nothing** and shows the empty
state. No cleanup and no warning: silently rewriting a saved view because a
category went unused for a month is worse than an empty list the user can act
on.

## What the view scopes

```
periodScoped = filterByPeriod(transactions, period)
viewScoped   = applyView(periodScoped, activeView)     // new
chips        = deriveCategories(viewScoped)
visible      = applyCategoryFilter(viewScoped, category)
page         = pageSlice(visible, pages)
totals       = computeTotals(viewScoped)               // was periodScoped
```

Each stage narrows the one before it, so period → view → chip → page reads top
to bottom with no cross-talk.

**Scopes to the view:** summary income and expense totals, the spending
breakdown, the trend message, the category chips, the list.

**Deliberately global:**

| Stays global | Why |
|---|---|
| Balance | The one all-time figure on the screen (`Summary.tsx:9`). A balance scoped to three categories is not a smaller balance — it is not a balance. |
| Heatmap | Its shading percentiles need the whole range. |
| Unallocated | Balance minus what the envelopes hold; both sides are global. Scoping half of a subtraction produces a number that means nothing. |

**The trend message scopes**, which changes today's behaviour
(`TransactionsScreen.tsx:79` currently compares this calendar month with last
across everything). Left global under an active view it would sit directly above
view-scoped totals describing a different set of transactions — one sentence
quietly contradicting the numbers beside it. It costs one extra `applyView` call
over full history.

**Switching tabs clears the selected chip**, synchronously, exactly as
`setPeriod` already reconciles it (`TransactionsScreen.tsx:89-100`): the chip
may not exist inside the new view.

**The active view is not persisted; it resets to All on load.** A remembered
filter that hides data is a footgun, and this one would survive an app restart
with no obvious cause.

**Deleting the active view falls back to All**, in the same synchronous step
that saves the new array — otherwise the screen would be filtered by a tab that
is no longer on it, the exact failure `setPeriod` already guards against for
chips.

One new empty-state key, `emptyViewFiltered`, joins the four that exist.

## Ownership

`TransactionsScreen` owns `views`, `activeViewId` and `managerOpen`, and renders
the `ViewManager` modal itself, lazily.

This departs from the existing pattern, where `AppShell` renders every modal.
The reason is containment: views are a transactions-screen concern that nothing
else reads, `AppShell` already carries ten modals, and routing this one through
it would mean threading four more props and two more state variables through a
file whose size was the reason `TransactionsScreen` was extracted in the first
place.

## Components

**Views live in the category filter row**, not in a row of their own. One
scrolling row carries both axes:

```
[Daily needs] [Income] ‖ [All] [Food] [Transport] │ [Salary] [⋯]
     saved views        strong      category chips        manage
                       divider     (today's row, unchanged)
```

Views come first, a heavier divider separates the two groups, and the manage
button rides at the end as the only entry point for creating a view.

**Views have no "All" chip of their own.** The category group already owns that
word, and two chips labelled "All" meaning different things — no view versus no
category — is worse than the alternative: tapping an active view chip clears it,
exactly as tapping an active category chip already does (`CategoryFilter.tsx:43`).

**Visibility becomes `chips.length >= 2 || views.length > 0`.** The existing rule
hid the row below two chips; that would now strand saved views off screen in a
sparse month. A period with one category and no views still gets no row.

This puts a whole-screen control in the same row as one that only narrows the
list below it. The divider and a distinct chip treatment — heavier border,
`--accent-strong` text — carry the difference, which a second stacked row would
have carried by position instead.

**`ViewManager.tsx` + `.css`** — one self-contained modal:

```ts
interface ViewManagerProps {
  views: View[];
  transactions: Transaction[];   // to offer categories actually in use
  onSave: (views: View[]) => void;
  onClose: () => void;
}
```

It internally toggles between **list mode** (edit / delete / move up / move
down per view) and **form mode**. `TransactionsScreen` therefore holds one new
piece of modal state — `managerOpen: boolean` — instead of the
`null | 'new' | View` editor pattern spread across the screen. The array goes
in, a new array comes back, and the screen never sees the intermediate states.

**`ViewForm.tsx`** — split out because the category picker is the bulk of the
markup and `ViewManager` stays readable without it. The picker reuses the chip
pattern from `AllocationForm.tsx`, offering preset categories plus every
category present in the user's transactions.

**Categories are not exclusive here**, unlike the allocation picker: two views
may both claim Food, because a view is a lens and not an envelope. This is the
one place the two pickers deliberately differ.

**Reorder is in scope**, via plain up/down buttons — no drag library, about ten
lines. Tab order decides whether your most-used view is first or scrolled off
screen, which is most of what "customize what they want" means.

**`CategoryFilter.tsx` gains the view chips, the divider and the manage
button**, plus the widened visibility rule above. Its category behaviour is
untouched: it still derives from whatever scope it is handed, so a
single-category view collapses that half of the row with no special case.

---

# Part 2 — A Shorter Page

## The Insights disclosure

**`InsightsPanel.tsx` + `.css`** wraps the savings strip, the trend message and
the spending chart in a native `<details>` / `<summary>`. Native rather than a
hand-rolled toggle: keyboard operation, correct ARIA semantics and
browser find-in-page come free, and the only state is the `open` attribute.

Open state persists through `loadInsightsOpen` / `saveInsightsOpen`,
**defaulting to closed**. The default is the point — the shortening happens
before anyone touches anything.

## Day-picking moves to the period bar

Collapsing the chart would otherwise remove the only way to select a single day:
`PeriodBar` offers last month, this month and a month dropdown, and nothing
finer. Rather than accept that cost, `PeriodBar` gains a native date input
beside the dropdown:

- `value` is the selected day when `period.kind === 'date'`, otherwise empty.
- `max={todayISO}`, matching `availableMonths` (`period.ts:60`), which already
  refuses to navigate into the future.
- Clearing it returns to **the month that day sat in**, not today's month.
  `PeriodBar.tsx:25` already computes that value for the dropdown, so the
  behaviour is reused rather than invented, and the user lands where they were
  looking.

The heatmap still selects days when Insights is expanded. Both routes set the
same `{ kind: 'date' }` period, so they cannot disagree. Day selection comes out
ahead: typing a date beats hunting for a cell, particularly for a day in a month
not currently on screen.

## Final page order

```
PeriodBar          control  (last / this / month / date)
Summary            core
AllocationsStrip   actionable
> Insights         collapsed  (savings, trend, chart)        new
CategoryFilter     control  (views ‖ categories ⋯)           extended
TransactionList
Load more
```

Two one-row controls and the summary before the list; everything tall sits
behind one tap. Folding the views into the existing filter row rather than
adding one of their own is what keeps the count at two.

**The allocations strip stays outside the disclosure.** It is the only way to
create an envelope — a deliberate decision in the allocation spec — and burying
the sole entry point to a feature inside a collapsed section would undo it.

---

# Testing

Pure modules carry the logic: `vitest.config.ts` collects only `*.test.ts` and
the project has no component-testing library.

**`views.test.ts`**

- `type: 'all'` passes income and expense through
- `type: 'expense'` excludes income, and the reverse
- an empty category list returns everything of that type
- a populated list matches exactly after trim, so `Food` and `food` stay
  distinct
- the `UNCATEGORIZED` sentinel matches blank-category rows
- a view whose categories are all unused returns empty rather than everything

**`normalizeView`**

- a well-formed object round-trips
- missing `id`, missing `name`, non-array `categories`, and an unknown `type`
  each return `null`
- `loadViews` drops nulls and keeps the survivors, so one corrupt entry does not
  take the tab bar with it

**Composition**, in the `categoryChips.test.ts` style: applying a view then a
chip filter yields the same set as the combined predicate, in either order.

**Not unit-tested, verified by hand:** `CategoryFilter`, `ViewManager`, `ViewForm`,
`InsightsPanel`, the `PeriodBar` date input, and `<details>` persistence. The
implementation plan carries these as an explicit manual checklist rather than
implying coverage that does not exist.

**Verification:** `pnpm typecheck`, `pnpm test`, `pnpm build`.
