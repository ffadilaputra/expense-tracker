# Custom View Tabs and a Shorter Transaction Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add saved multi-category view tabs to the transactions screen, and shorten the page by collapsing the savings strip, trend message and spending chart behind a disclosure.

**Architecture:** A `View` is a name, a list of categories and a type scope, stored in localStorage as a device preference. Filtering is a pure function applied between the period filter and the category-chip filter, so the screen narrows period → view → chip → page. The page shortens via a native `<details>` disclosure, with day-selection moved into `PeriodBar` so collapsing the heatmap costs nothing.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (jsdom), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-03-custom-view-tabs-design.md`

## Global Constraints

- **Do not add npm dependencies.** `package.json` has exactly `react` and `react-dom` at runtime. No drag-and-drop library — reorder uses plain up/down buttons.
- **No Apps Script changes.** Views are device-local. `Code.gs` is untouched and no redeploy is needed.
- **Vitest collects only `src/**/*.test.ts`** (see `vitest.config.ts`) — `.ts`, not `.tsx`. There is no component-testing library and none is to be added. Logic that needs testing goes in a pure `.ts` module; UI tasks verify with `pnpm typecheck`, `pnpm build`, and the manual checklist in Task 9.
- **Every user-visible string goes through `t('key')`** with entries in both `en` and `id` in `src/i18n/translations.ts`. `id` is typed `Record<TranslationKey, string>`, so a missing Indonesian string is a compile error.
- **CSS uses the design tokens** in `src/index.css` (`--space-1`…`--space-7`, `--radius-sm/md/lg/pill`, `--line`, `--surface`, `--muted`, `--accent`, `--on-accent`, `--accent-strong`, `--income`, `--expense`). Do not hard-code rem spacing or hex colours.
- **Dates are ISO `YYYY-MM-DD` strings**, compared as strings.
- **Commands:** `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm dev`. Single file: `pnpm vitest run <path>`.
- **Verification commands must not be piped through `tail`** — the pipe masks the exit code. Redirect to a file and echo `$?` (fish: `$status`), then inspect the file.
- **Commit after every task**, conventional-commit prefixes.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/transactions/views.ts` (new) | `View` type, `applyView`, `normalizeView`, `makeViewId` — all pure |
| `src/features/transactions/views.test.ts` (new) | Tests for the above |
| `src/config/viewPrefs.ts` (new) | localStorage read/write for views and the disclosure state |
| `src/config/viewPrefs.test.ts` (new) | Tests that corrupt entries are dropped |
| `src/features/transactions/categoryChips.ts` (modify) | Export the private `normalize` as `normalizeCategory` |
| `src/features/transactions/ViewTabs.tsx` + `.css` (new) | The tab row |
| `src/features/transactions/ViewForm.tsx` (new) | Add/edit form with the category picker |
| `src/features/transactions/ViewManager.tsx` + `.css` (new) | Modal: list mode + form mode |
| `src/features/transactions/InsightsPanel.tsx` + `.css` (new) | Generic `<details>` disclosure |
| `src/features/transactions/SpendingChart.tsx` (modify) | Rename its file-local `View` type to `ChartMode` |
| `src/features/transactions/PeriodBar.tsx` + `.css` (modify) | Add the date input |
| `src/features/transactions/TransactionsScreen.tsx` (modify) | Compose everything |
| `src/i18n/translations.ts` (modify) | New keys, `en` and `id` |

`CategoryFilter.tsx` is deliberately **not** in this list. It already derives
from whatever scope it is handed and already hides itself below two chips
(`CategoryFilter.tsx:17`), so pointing it at the view-scoped set is a change in
Task 9's wiring, not in the component.

---

### Task 1: `views.ts` — the View model and filter

**Files:**
- Create: `src/features/transactions/views.ts`
- Test: `src/features/transactions/views.test.ts`
- Modify: `src/features/transactions/categoryChips.ts:21-24`

**Interfaces:**
- Consumes: `Transaction` from `src/types.ts`; `UNCATEGORIZED` from `categoryChips.ts:19`.
- Produces, used by every later task: `ViewType`, `View`, `ALL_VIEW_ID`, `ALL_VIEW`, `applyView(txns, view)`, `normalizeView(raw)`, `makeViewId()`, and `normalizeCategory(category)` newly exported from `categoryChips.ts`.

**Critical detail — do not "fix" this.** `UNCATEGORIZED` is the string `' uncategorized'` with a **leading space**, deliberately collision-proof because real categories are trimmed. Therefore:
- The **transaction** side is normalized (`normalizeCategory` trims, and maps blank to the sentinel).
- The **view** side is stored verbatim and never trimmed, because trimming would turn `' uncategorized'` into `'uncategorized'` and silently stop matching. The category picker stores whatever `deriveCategories` produced, which is already normalized.

- [ ] **Step 1: Export the category normalizer**

In `src/features/transactions/categoryChips.ts`, rename the private helper and export it. Change:

```ts
function normalize(category: string): string {
  const trimmed = category.trim();
  return trimmed === '' ? UNCATEGORIZED : trimmed;
}
```

to:

```ts
/**
 * Exported so view filtering matches categories the same way the chips do -
 * two definitions of "what counts as this category" would drift.
 */
export function normalizeCategory(category: string): string {
  const trimmed = category.trim();
  return trimmed === '' ? UNCATEGORIZED : trimmed;
}
```

Then update the two existing call sites in that file (`deriveCategories` and `applyCategoryFilter`) from `normalize(...)` to `normalizeCategory(...)`.

- [ ] **Step 2: Write the failing test**

Create `src/features/transactions/views.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyView, makeViewId, normalizeView, ALL_VIEW, type View } from './views';
import { UNCATEGORIZED } from './categoryChips';
import type { Transaction } from '../../types';

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

function mk(over: Partial<View> = {}): View {
  return { id: 'v1', name: 'Daily needs', categories: [], type: 'all', ...over };
}

const rows = [
  txn({ id: 'a', type: 'expense', category: 'Food' }),
  txn({ id: 'b', type: 'expense', category: 'Transport' }),
  txn({ id: 'c', type: 'income', category: 'Salary' }),
  txn({ id: 'd', type: 'income', category: 'Gift' }),
  txn({ id: 'e', type: 'expense', category: '' })
];

const ids = (list: Transaction[]) => list.map((t) => t.id);

describe('applyView', () => {
  it('passes everything through for the All view', () => {
    expect(ids(applyView(rows, ALL_VIEW))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps only expenses when the type is expense', () => {
    expect(ids(applyView(rows, mk({ type: 'expense' })))).toEqual(['a', 'b', 'e']);
  });

  it('keeps only income when the type is income', () => {
    expect(ids(applyView(rows, mk({ type: 'income' })))).toEqual(['c', 'd']);
  });

  // The rule that makes an "Income" view survive inventing a new category.
  it('treats an empty category list as every category of that type', () => {
    expect(ids(applyView(rows, mk({ type: 'income', categories: [] })))).toEqual(['c', 'd']);
  });

  it('filters to the listed categories', () => {
    const view = mk({ type: 'expense', categories: ['Food', 'Transport'] });
    expect(ids(applyView(rows, view))).toEqual(['a', 'b']);
  });

  it('matches categories exactly, so Food and food stay distinct', () => {
    expect(ids(applyView(rows, mk({ categories: ['food'] })))).toEqual([]);
  });

  it('ignores surrounding whitespace on the transaction side', () => {
    const spaced = [txn({ id: 'x', category: '  Food  ' })];
    expect(ids(applyView(spaced, mk({ categories: ['Food'] })))).toEqual(['x']);
  });

  // The sentinel carries a leading space on purpose; it must not be trimmed.
  it('matches blank-category transactions via the uncategorized sentinel', () => {
    expect(ids(applyView(rows, mk({ categories: [UNCATEGORIZED] })))).toEqual(['e']);
  });

  it('returns nothing when none of the listed categories are in use', () => {
    expect(ids(applyView(rows, mk({ categories: ['Yacht'] })))).toEqual([]);
  });

  it('applies type and categories together', () => {
    const view = mk({ type: 'income', categories: ['Gift'] });
    expect(ids(applyView(rows, view))).toEqual(['d']);
  });
});

describe('normalizeView', () => {
  const good = { id: 'v1', name: 'Daily needs', categories: ['Food'], type: 'expense' };

  it('round-trips a well-formed object', () => {
    expect(normalizeView(good)).toEqual(good);
  });

  it('trims the name', () => {
    expect(normalizeView({ ...good, name: '  Daily needs  ' })!.name).toBe('Daily needs');
  });

  it('rejects a missing or empty id', () => {
    expect(normalizeView({ ...good, id: undefined })).toBeNull();
    expect(normalizeView({ ...good, id: '' })).toBeNull();
  });

  it('rejects a missing or blank name', () => {
    expect(normalizeView({ ...good, name: undefined })).toBeNull();
    expect(normalizeView({ ...good, name: '   ' })).toBeNull();
  });

  it('rejects categories that are not an array', () => {
    expect(normalizeView({ ...good, categories: 'Food' })).toBeNull();
  });

  it('rejects an unknown type', () => {
    expect(normalizeView({ ...good, type: 'savings' })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(normalizeView(null)).toBeNull();
    expect(normalizeView('view')).toBeNull();
    expect(normalizeView(42)).toBeNull();
  });

  it('drops non-string and empty category entries', () => {
    const v = normalizeView({ ...good, categories: ['Food', 7, '', null, 'Transport'] });
    expect(v!.categories).toEqual(['Food', 'Transport']);
  });

  // Trimming here would destroy the sentinel's leading space.
  it('preserves the uncategorized sentinel verbatim', () => {
    const v = normalizeView({ ...good, categories: [UNCATEGORIZED] });
    expect(v!.categories).toEqual([UNCATEGORIZED]);
  });
});

describe('makeViewId', () => {
  it('produces distinct ids', () => {
    expect(makeViewId()).not.toBe(makeViewId());
  });

  it('is prefixed so it is recognisable in storage', () => {
    expect(makeViewId().startsWith('view-')).toBe(true);
  });
});

// The property the screen depends on: period -> view -> chip narrows to the
// same set as a single combined predicate, so the stages cannot disagree about
// what is on screen.
describe('composing a view with a category chip', () => {
  const view: View = { id: 'v1', name: 'Spending', categories: [], type: 'expense' };
  const chip = { category: 'Food', type: 'expense' as const };

  it('matches the combined predicate', () => {
    const composed = applyCategoryFilter(applyView(rows, view), chip);
    const direct = rows.filter((t) => t.type === 'expense' && t.category === 'Food');
    expect(ids(composed)).toEqual(ids(direct));
  });

  it('gives the same answer in either order', () => {
    const viewFirst = applyCategoryFilter(applyView(rows, view), chip);
    const chipFirst = applyView(applyCategoryFilter(rows, chip), view);
    expect(ids(viewFirst)).toEqual(ids(chipFirst));
  });
});
```

The composition block needs `applyCategoryFilter` in the import from
`./categoryChips`, alongside `UNCATEGORIZED`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/features/transactions/views.test.ts`
Expected: FAIL — `Failed to resolve import "./views"`.

- [ ] **Step 4: Write the implementation**

Create `src/features/transactions/views.ts`:

```ts
import { normalizeCategory } from './categoryChips';
import type { Transaction } from '../../types';

/** Which side of the ledger a view looks at. */
export type ViewType = 'all' | 'expense' | 'income';

/**
 * A named, reusable filter - the thing the transient chip row cannot express.
 * An empty `categories` list means every category of `type`, so an "Income"
 * view keeps working when a new income category is invented next month.
 */
export interface View {
  id: string;
  name: string;
  categories: string[];
  type: ViewType;
}

export const ALL_VIEW_ID = 'all';

/**
 * The unfiltered first tab. Synthesized rather than stored, so it cannot be
 * renamed, deleted or corrupted. `name` is empty on purpose: the tab bar
 * renders a translated label for this id, so it follows the user's language
 * instead of freezing whichever one was active when it was created.
 */
export const ALL_VIEW: View = { id: ALL_VIEW_ID, name: '', categories: [], type: 'all' };

const TYPES: ViewType[] = ['all', 'expense', 'income'];

export function makeViewId(): string {
  return `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Narrows by type, then by category if any are listed.
 *
 * Only the transaction side is normalized. View entries are stored exactly as
 * the picker supplied them - already normalized - because UNCATEGORIZED
 * carries a deliberate leading space that trimming would destroy, silently
 * unclaiming every blank-category row.
 */
export function applyView(txns: Transaction[], view: View): Transaction[] {
  const byType = view.type === 'all' ? txns : txns.filter((t) => t.type === view.type);
  if (view.categories.length === 0) return byType;

  const claimed = new Set(view.categories);
  return byType.filter((t) => claimed.has(normalizeCategory(t.category)));
}

/**
 * localStorage is the one input the user can hand-edit and that survives across
 * app versions, so anything malformed degrades to "that view is gone" rather
 * than taking the tab bar down with it.
 */
export function normalizeView(raw: unknown): View | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;

  if (typeof v.id !== 'string' || v.id === '') return null;
  if (typeof v.name !== 'string' || v.name.trim() === '') return null;
  if (!Array.isArray(v.categories)) return null;
  if (typeof v.type !== 'string' || !TYPES.includes(v.type as ViewType)) return null;

  return {
    id: v.id,
    name: v.name.trim(),
    categories: v.categories.filter((c): c is string => typeof c === 'string' && c !== ''),
    type: v.type as ViewType
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/features/transactions/views.test.ts src/features/transactions/categoryChips.test.ts`
Expected: PASS both files — the second proves the `normalizeCategory` rename did not break the chips.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/views.ts src/features/transactions/views.test.ts src/features/transactions/categoryChips.ts
git commit -m "feat: add View model and filter"
```

---

### Task 2: `viewPrefs.ts` — localStorage

**Files:**
- Create: `src/config/viewPrefs.ts`
- Test: `src/config/viewPrefs.test.ts`

**Interfaces:**
- Consumes: `View`, `normalizeView` (Task 1).
- Produces: `loadViews(): View[]`, `saveViews(views: View[]): void`, `loadInsightsOpen(): boolean`, `saveInsightsOpen(open: boolean): void`. Task 9 consumes all four.

- [ ] **Step 1: Write the failing test**

Create `src/config/viewPrefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadViews, saveViews, loadInsightsOpen, saveInsightsOpen } from './viewPrefs';
import type { View } from '../features/transactions/views';

const view: View = { id: 'v1', name: 'Daily needs', categories: ['Food'], type: 'expense' };

beforeEach(() => {
  localStorage.clear();
});

describe('views storage', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(loadViews()).toEqual([]);
  });

  it('round-trips saved views', () => {
    saveViews([view]);
    expect(loadViews()).toEqual([view]);
  });

  it('returns an empty list when the stored value is not JSON', () => {
    localStorage.setItem('finance:views', 'not json');
    expect(loadViews()).toEqual([]);
  });

  it('returns an empty list when the stored value is not an array', () => {
    localStorage.setItem('finance:views', '{"id":"v1"}');
    expect(loadViews()).toEqual([]);
  });

  // One bad entry must not cost the user their other views.
  it('drops corrupt entries and keeps the survivors', () => {
    localStorage.setItem(
      'finance:views',
      JSON.stringify([view, { id: 'broken' }, null, { ...view, id: 'v2', name: 'Income' }])
    );
    expect(loadViews().map((v) => v.id)).toEqual(['v1', 'v2']);
  });
});

describe('insights disclosure state', () => {
  it('defaults to closed', () => {
    expect(loadInsightsOpen()).toBe(false);
  });

  it('round-trips true', () => {
    saveInsightsOpen(true);
    expect(loadInsightsOpen()).toBe(true);
  });

  it('round-trips false', () => {
    saveInsightsOpen(true);
    saveInsightsOpen(false);
    expect(loadInsightsOpen()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/config/viewPrefs.test.ts`
Expected: FAIL — `Failed to resolve import "./viewPrefs"`.

- [ ] **Step 3: Write the implementation**

Create `src/config/viewPrefs.ts`:

```ts
// Transaction-page view preferences. Stored like the theme and locale rather
// than in the sheet: they describe how this browser shows the data, not the
// data itself.

import { normalizeView, type View } from '../features/transactions/views';

const VIEWS_KEY = 'finance:views';
const INSIGHTS_KEY = 'finance:insights-open';

export function loadViews(): View[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeView).filter((v): v is View => v !== null);
  } catch {
    // Unparseable or unreadable storage: start from no views rather than
    // failing the screen that renders them.
    return [];
  }
}

export function saveViews(views: View[]): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Private browsing; the views apply for this session and are not kept.
  }
}

/** Closed by default - that default is what shortens the page. */
export function loadInsightsOpen(): boolean {
  try {
    return localStorage.getItem(INSIGHTS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveInsightsOpen(open: boolean): void {
  try {
    localStorage.setItem(INSIGHTS_KEY, open ? '1' : '0');
  } catch {
    // As above.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/config/viewPrefs.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/config/viewPrefs.ts src/config/viewPrefs.test.ts
git commit -m "feat: persist views and the insights disclosure state"
```

---

### Task 3: Translation strings

All strings in one pass so English and Indonesian wording stays consistent.

**Files:**
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces: the keys below, consumed by Tasks 4–9.

- [ ] **Step 1: Add the English keys**

In the `en` object, immediately after `loadMoreRemaining` (in the `// List` block):

```ts
  emptyViewFiltered: 'No transactions in this view.',
```

Then, immediately before the `// Debts` comment block:

```ts
  // Views (saved category filters shown as tabs)
  viewTabsLabel: 'Views',
  viewManageLabel: 'Manage views',
  viewManageTitle: 'Views',
  viewAddBtn: 'New view',
  viewAddTitle: 'New view',
  viewEditTitle: 'Edit view',
  viewNone: 'No views yet. Create one to filter by the categories you care about.',
  viewFieldName: 'Name',
  viewNamePlaceholder: 'Daily needs',
  viewFieldType: 'Shows',
  viewTypeAll: 'Everything',
  viewTypeExpense: 'Expenses',
  viewTypeIncome: 'Income',
  viewFieldCategories: 'Categories',
  viewAllCategoriesHint: 'None selected — this view shows every category.',
  viewMoveUp: 'Move up',
  viewMoveDown: 'Move down',
  viewDeleteConfirm: 'Delete this view?',

  // Insights disclosure
  insightsTitle: 'Insights',
```

And in the `// Period` block, after `periodPickMonth`:

```ts
  periodPickDay: 'Pick a day',
```

- [ ] **Step 2: Add the Indonesian keys**

In the `id` object, in the matching positions:

```ts
  emptyViewFiltered: 'Tidak ada transaksi pada tampilan ini.',
```

```ts
  // Tampilan (filter kategori tersimpan)
  viewTabsLabel: 'Tampilan',
  viewManageLabel: 'Atur tampilan',
  viewManageTitle: 'Tampilan',
  viewAddBtn: 'Tampilan baru',
  viewAddTitle: 'Tampilan baru',
  viewEditTitle: 'Ubah tampilan',
  viewNone: 'Belum ada tampilan. Buat satu untuk menyaring kategori yang kamu pantau.',
  viewFieldName: 'Nama',
  viewNamePlaceholder: 'Kebutuhan harian',
  viewFieldType: 'Menampilkan',
  viewTypeAll: 'Semua',
  viewTypeExpense: 'Pengeluaran',
  viewTypeIncome: 'Pemasukan',
  viewFieldCategories: 'Kategori',
  viewAllCategoriesHint: 'Belum dipilih — tampilan ini memuat semua kategori.',
  viewMoveUp: 'Naikkan',
  viewMoveDown: 'Turunkan',
  viewDeleteConfirm: 'Hapus tampilan ini?',

  // Panel wawasan
  insightsTitle: 'Wawasan',
```

```ts
  periodPickDay: 'Pilih hari',
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: exit 0. A key present in `en` but missing from `id` is a compile error, because `id` is annotated `Record<TranslationKey, string>` — so a clean run proves both objects match.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: add view tab and insights translation strings"
```

---

### Task 4: `ViewTabs`

**Files:**
- Create: `src/features/transactions/ViewTabs.tsx`
- Create: `src/features/transactions/ViewTabs.css`

**Interfaces:**
- Consumes: `View`, `ALL_VIEW_ID` (Task 1); the `view*` keys (Task 3).
- Produces:

```ts
export interface ViewTabsProps {
  /** User views only; the All tab is rendered here, not passed in. */
  views: View[];
  activeId: string;
  onSelect: (id: string) => void;
  onManage: () => void;
}
```

- [ ] **Step 1: Write the component**

Create `src/features/transactions/ViewTabs.tsx`:

```tsx
import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { ALL_VIEW_ID, type View } from './views';
import './ViewTabs.css';

export interface ViewTabsProps {
  views: View[];
  activeId: string;
  onSelect: (id: string) => void;
  onManage: () => void;
}

/**
 * Sits directly under the period bar because it rescopes the whole screen -
 * placement is a claim about scope, and a whole-screen control below the
 * things it changes reads as filtering only what follows it.
 */
function ViewTabs({ views, activeId, onSelect, onManage }: ViewTabsProps) {
  const { t } = useI18n();

  return (
    <section className="view-tabs" aria-label={t('viewTabsLabel')}>
      <div className="view-tabs__row" role="group" aria-label={t('viewTabsLabel')}>
        {/* The All tab is synthesized, so its label follows the user's
            language rather than being frozen into stored data. */}
        <button
          type="button"
          className={`view-tabs__tab ${activeId === ALL_VIEW_ID ? 'active' : ''}`}
          aria-pressed={activeId === ALL_VIEW_ID}
          onClick={() => onSelect(ALL_VIEW_ID)}
        >
          {t('filterAllLabel')}
        </button>

        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`view-tabs__tab ${activeId === view.id ? 'active' : ''}`}
            aria-pressed={activeId === view.id}
            onClick={() => onSelect(view.id)}
          >
            {view.name}
          </button>
        ))}

        <button
          type="button"
          className="view-tabs__manage"
          onClick={onManage}
          aria-label={t('viewManageLabel')}
          title={t('viewManageLabel')}
        >
          ⋯
        </button>
      </div>
    </section>
  );
}

export default memo(ViewTabs);
```

- [ ] **Step 2: Write the styles**

Create `src/features/transactions/ViewTabs.css`:

```css
/* Saved views, directly under the period bar. Scrolls horizontally like the
   category filter and the two strips, so a long row behaves the same way
   everywhere on this page. */
.view-tabs { overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch; }
.view-tabs__row {
  display: inline-flex; align-items: center; gap: 0.4rem; padding-bottom: 2px;
}
.view-tabs__tab {
  border: 1px solid var(--line); background: var(--surface); color: var(--text);
  border-radius: var(--radius-pill); padding: 0.35rem 0.85rem; font-size: 0.8rem;
  min-height: 34px; white-space: nowrap;
}
.view-tabs__tab.active {
  background: var(--accent); border-color: var(--accent);
  color: var(--on-accent); font-weight: 600;
}
.view-tabs__manage {
  border: 1px dashed var(--line); background: transparent; color: var(--muted);
  border-radius: var(--radius-pill); padding: 0.35rem 0.7rem; font-size: 0.9rem;
  min-height: 34px; line-height: 1;
}
@media (hover: hover) { .view-tabs__manage:hover { border-color: var(--muted); } }
```

- [ ] **Step 3: Verify**

Run `pnpm typecheck`, then `pnpm build`. Both must exit 0. Nothing renders this yet — Task 9 mounts it.

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/ViewTabs.tsx src/features/transactions/ViewTabs.css
git commit -m "feat: add view tab row"
```

---

### Task 5: `ViewForm`

**Files:**
- Create: `src/features/transactions/ViewForm.tsx`

**Interfaces:**
- Consumes: `View`, `ViewType`, `makeViewId` (Task 1); `deriveCategories`, `UNCATEGORIZED` (`categoryChips.ts`); `EXPENSE_CATEGORIES`, `INCOME_CATEGORIES` (`src/config/categories.ts`); the `view*` keys (Task 3).
- Produces:

```ts
export interface ViewFormProps {
  transactions: Transaction[];
  initialValue?: View;
  onSubmit: (view: View) => void;
  onCancel: () => void;
}
```

`onSubmit` receives a complete `View` — the form mints the id for a new one, so the manager never has to.

- [ ] **Step 1: Write the component**

Create `src/features/transactions/ViewForm.tsx`:

```tsx
import { memo, useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../config/categories';
import { deriveCategories, UNCATEGORIZED } from './categoryChips';
import { makeViewId, type View, type ViewType } from './views';
import type { Transaction } from '../../types';

export interface ViewFormProps {
  transactions: Transaction[];
  initialValue?: View;
  onSubmit: (view: View) => void;
  onCancel: () => void;
}

const TYPES: ViewType[] = ['all', 'expense', 'income'];

const TYPE_KEYS = {
  all: 'viewTypeAll',
  expense: 'viewTypeExpense',
  income: 'viewTypeIncome'
} as const;

function ViewForm({ transactions, initialValue, onSubmit, onCancel }: ViewFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [type, setType] = useState<ViewType>(initialValue?.type ?? 'all');
  const [picked, setPicked] = useState<string[]>(initialValue?.categories ?? []);

  /**
   * Categories actually in use, narrowed to the selected type, plus the presets
   * for that type. Values come from deriveCategories so they are already
   * normalized - including the uncategorized sentinel, which must be stored
   * verbatim rather than trimmed.
   */
  const options = useMemo(() => {
    const set = new Set<string>();

    for (const chip of deriveCategories(transactions)) {
      if (type === 'all' || chip.type === type) set.add(chip.category);
    }
    if (type === 'all' || type === 'expense') for (const c of EXPENSE_CATEGORIES) set.add(c);
    if (type === 'all' || type === 'income') for (const c of INCOME_CATEGORIES) set.add(c);
    for (const c of picked) set.add(c);

    return [...set].sort((a, b) => {
      // Uncategorized last so it never pushes real categories out of reach.
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  }, [transactions, type, picked]);

  function toggle(category: string) {
    setPicked((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '') return;
    onSubmit({
      id: initialValue?.id ?? makeViewId(),
      name: name.trim(),
      categories: picked,
      type
    });
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('viewFieldName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('viewNamePlaceholder')}
          autoFocus
          required
        />
      </label>

      <label>
        {t('viewFieldType')}
        <select value={type} onChange={(e) => setType(e.target.value as ViewType)}>
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {t(TYPE_KEYS[value])}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="alloc-form__categories">
        <legend>{t('viewFieldCategories')}</legend>
        <div className="alloc-form__chips">
          {options.map((category) => (
            <button
              key={category}
              type="button"
              className={`alloc-form__chip ${picked.includes(category) ? 'active' : ''}`}
              onClick={() => toggle(category)}
            >
              {category === UNCATEGORIZED ? t('uncategorized') : category}
            </button>
          ))}
        </div>
        {/* Empty is a valid, useful state here - unlike the allocation picker,
            where it would mean an envelope that nothing draws down. */}
        {picked.length === 0 && (
          <p className="alloc-form__hint">{t('viewAllCategoriesHint')}</p>
        )}
      </fieldset>

      <div className="form-actions">
        <button className="btn btn--primary" type="submit">
          {isEditing ? t('updateBtn') : t('saveBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onCancel}>
          {t('cancelBtn')}
        </button>
      </div>
    </form>
  );
}

export default memo(ViewForm);
```

The `alloc-form__*` classes are reused deliberately — they already style exactly this picker shape in `src/styles/forms.css`, and duplicating them under a `view-form__` prefix would mean two copies to keep in sync.

- [ ] **Step 2: Verify**

Run `pnpm typecheck`, then `pnpm build`. Both must exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/transactions/ViewForm.tsx
git commit -m "feat: add view add/edit form"
```

---

### Task 6: `ViewManager`

**Files:**
- Create: `src/features/transactions/ViewManager.tsx`
- Create: `src/features/transactions/ViewManager.css`

**Interfaces:**
- Consumes: `View` (Task 1); `ViewForm` (Task 5); the `view*` keys (Task 3).
- Produces:

```ts
export interface ViewManagerProps {
  views: View[];
  transactions: Transaction[];
  /** Called with the complete new array on every mutation. */
  onSave: (views: View[]) => void;
  onClose: () => void;
}
```

- [ ] **Step 1: Write the component**

Create `src/features/transactions/ViewManager.tsx`:

```tsx
import { memo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import ViewForm from './ViewForm';
import type { View } from './views';
import type { Transaction } from '../../types';
import './ViewManager.css';

export interface ViewManagerProps {
  views: View[];
  transactions: Transaction[];
  onSave: (views: View[]) => void;
  onClose: () => void;
}

/** null = list mode; 'new' = adding; a View = editing that one. */
type Editing = null | 'new' | View;

/**
 * Self-contained: the array goes in, a new array comes back on every mutation,
 * and the screen holds one boolean rather than an editor state machine.
 */
function ViewManager({ views, transactions, onSave, onClose }: ViewManagerProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Editing>(null);

  function handleSubmit(view: View) {
    const exists = views.some((v) => v.id === view.id);
    onSave(exists ? views.map((v) => (v.id === view.id ? view : v)) : [...views, view]);
    setEditing(null);
  }

  function handleDelete(view: View) {
    if (!confirm(t('viewDeleteConfirm'))) return;
    onSave(views.filter((v) => v.id !== view.id));
  }

  /** Swaps with the neighbour; the ends are no-ops rather than wrapping. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= views.length) return;
    const next = [...views];
    [next[index], next[target]] = [next[target], next[index]];
    onSave(next);
  }

  if (editing !== null) {
    return (
      <>
        <h2 className="modal__title">
          {editing === 'new' ? t('viewAddTitle') : t('viewEditTitle')}
        </h2>
        <ViewForm
          key={editing === 'new' ? 'new' : editing.id}
          transactions={transactions}
          initialValue={editing === 'new' ? undefined : editing}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
        />
      </>
    );
  }

  return (
    <>
      <h2 className="modal__title">{t('viewManageTitle')}</h2>

      {views.length === 0 ? (
        <p className="view-manager__empty">{t('viewNone')}</p>
      ) : (
        <ul className="view-manager__list">
          {views.map((view, i) => (
            <li key={view.id}>
              <button
                type="button"
                className="view-manager__name"
                onClick={() => setEditing(view)}
              >
                {view.name}
              </button>
              <div className="view-manager__actions">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={t('viewMoveUp')}
                  title={t('viewMoveUp')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === views.length - 1}
                  aria-label={t('viewMoveDown')}
                  title={t('viewMoveDown')}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="view-manager__delete"
                  onClick={() => handleDelete(view)}
                  aria-label={t('deleteBtn')}
                  title={t('deleteBtn')}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button className="btn btn--primary" type="button" onClick={() => setEditing('new')}>
          {t('viewAddBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onClose}>
          {t('closeBtn')}
        </button>
      </div>
    </>
  );
}

export default memo(ViewManager);
```

- [ ] **Step 2: Write the styles**

Create `src/features/transactions/ViewManager.css`:

```css
.view-manager__empty {
  margin: 0 0 var(--space-4); font-size: 0.85rem; color: var(--muted);
}
.view-manager__list { list-style: none; margin: 0 0 var(--space-4); padding: 0; }
.view-manager__list li {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) 0; border-bottom: 1px solid var(--line);
}
.view-manager__name {
  flex: 1 1 auto; min-width: 0; text-align: left;
  border: none; background: transparent; color: var(--text);
  font-size: 0.9rem; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.view-manager__actions { display: flex; gap: var(--space-1); flex: none; }
.view-manager__actions button {
  border: 1px solid var(--line); background: var(--surface); color: var(--muted);
  border-radius: var(--radius-sm); min-width: 32px; min-height: 32px; font-size: 0.85rem;
}
.view-manager__actions button:disabled { opacity: 0.35; }
.view-manager__delete { color: var(--expense); }
```

- [ ] **Step 3: Verify**

Run `pnpm typecheck`, then `pnpm build`. Both must exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/ViewManager.tsx src/features/transactions/ViewManager.css
git commit -m "feat: add view manager modal"
```

---

### Task 7: `InsightsPanel` and the `ChartMode` rename

**Files:**
- Create: `src/features/transactions/InsightsPanel.tsx`
- Create: `src/features/transactions/InsightsPanel.css`
- Modify: `src/features/transactions/SpendingChart.tsx:8` and its three usages

**Interfaces:**
- Consumes: the `insightsTitle` key (Task 3).
- Produces:

```ts
export interface InsightsPanelProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}
```

Generic on purpose: the panel knows how to disclose, and `TransactionsScreen` decides what goes inside. That keeps the contents a layout decision in one place rather than a dependency list here.

- [ ] **Step 1: Rename the colliding local type**

`SpendingChart.tsx:8` declares `type View = 'activity' | 'breakdown'` — file-local and unexported, but it now means something entirely different from the `View` in `views.ts`, inside the same folder. Rename it so a future reader importing the real `View` here does not have to untangle two meanings.

In `src/features/transactions/SpendingChart.tsx`:
- Line 8: `type View = 'activity' | 'breakdown';` → `type ChartMode = 'activity' | 'breakdown';`
- Line 28: `useState<View>('activity')` → `useState<ChartMode>('activity')`
- The two `setView(...)` calls and the `view === ...` comparisons keep their variable names; only the type annotation changes.

- [ ] **Step 2: Write the component**

Create `src/features/transactions/InsightsPanel.tsx`:

```tsx
import { memo, type ReactNode } from 'react';
import { useI18n } from '../../i18n/context';
import './InsightsPanel.css';

export interface InsightsPanelProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Native <details> rather than a hand-rolled toggle: keyboard operation, the
 * right ARIA semantics and browser find-in-page all come free, and the only
 * state to carry is the open flag.
 */
function InsightsPanel({ open, onToggle, children }: InsightsPanelProps) {
  const { t } = useI18n();

  return (
    <details
      className="insights"
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="insights__summary">{t('insightsTitle')}</summary>
      <div className="insights__body">{children}</div>
    </details>
  );
}

export default memo(InsightsPanel);
```

- [ ] **Step 3: Write the styles**

Create `src/features/transactions/InsightsPanel.css`:

```css
.insights { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.insights__summary {
  cursor: pointer; list-style: none; padding: var(--space-3) 0;
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
  font-weight: 500; color: var(--muted);
  display: flex; align-items: center; gap: var(--space-2);
}
/* Safari renders a default triangle through ::-webkit-details-marker. */
.insights__summary::-webkit-details-marker { display: none; }
.insights__summary::after { content: '▸'; margin-left: auto; font-size: 0.8rem; }
.insights[open] .insights__summary::after { content: '▾'; }
.insights__body {
  display: flex; flex-direction: column; gap: var(--space-5);
  padding-bottom: var(--space-4);
}
```

- [ ] **Step 4: Verify**

Run `pnpm typecheck`, then `pnpm test`, then `pnpm build`. All three must exit 0 — the test run confirms the `ChartMode` rename broke nothing.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/InsightsPanel.tsx src/features/transactions/InsightsPanel.css src/features/transactions/SpendingChart.tsx
git commit -m "feat: add insights disclosure panel"
```

---

### Task 8: Day selection in `PeriodBar`

**Files:**
- Modify: `src/features/transactions/PeriodBar.tsx`
- Modify: `src/features/transactions/PeriodBar.css`

**Interfaces:**
- Consumes: `periodPickDay` (Task 3); existing `Period`, `monthKey` from `src/utils/period.ts`.
- Produces: no signature change — `PeriodBarProps` is unchanged, and the new input calls the existing `onChange`.

- [ ] **Step 1: Add the date input**

In `src/features/transactions/PeriodBar.tsx`, after the month `<select>` (currently lines 52–63) and before `</section>`:

```tsx
      {/* The only way to select a single day now that the heatmap sits inside
          a collapsed panel. Typing a date also beats hunting for a cell when
          the day is in a month that is not on screen. */}
      <input
        type="date"
        className="period-bar__day"
        value={period.kind === 'date' ? period.date : ''}
        max={todayISO}
        aria-label={t('periodPickDay')}
        onChange={(e) =>
          onChange(
            e.target.value
              ? { kind: 'date', date: e.target.value }
              : // Clearing returns to the month that day sat in, not today's -
                // the user lands where they were looking. selectedMonth already
                // computes exactly this value for the dropdown.
                { kind: 'month', key: selectedMonth }
          )
        }
      />
```

`max={todayISO}` matches `availableMonths` (`period.ts:60`), which already refuses to navigate into the future.

- [ ] **Step 2: Style it**

Append to `src/features/transactions/PeriodBar.css`:

```css
/* Day selection, beside the month dropdown. */
.period-bar__day {
  border: 1px solid var(--line); border-radius: var(--radius-pill);
  background: var(--surface); color: var(--text);
  padding: 0.35rem 0.7rem; font-size: 0.8rem; min-height: 34px;
  font-family: inherit;
}
```

If `.period-bar__month` in that file already carries a shared look, match it rather than the values above — the two controls sit side by side and should not disagree.

- [ ] **Step 3: Verify**

Run `pnpm typecheck`, then `pnpm test`, then `pnpm build`. All three must exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/PeriodBar.tsx src/features/transactions/PeriodBar.css
git commit -m "feat: select a single day from the period bar"
```

---

### Task 9: Compose it all in `TransactionsScreen`

**Files:**
- Modify: `src/features/transactions/TransactionsScreen.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: no prop changes — `TransactionsScreenProps` is unchanged, so `AppShell` needs no edit.

- [ ] **Step 1: Add imports and state**

In `src/features/transactions/TransactionsScreen.tsx`, add to the imports:

```tsx
import { lazy, Suspense } from 'react';
import ViewTabs from './ViewTabs';
import InsightsPanel from './InsightsPanel';
import { applyView, ALL_VIEW, ALL_VIEW_ID, type View } from './views';
import {
  loadViews,
  saveViews,
  loadInsightsOpen,
  saveInsightsOpen
} from '../../config/viewPrefs';

const ViewManager = lazy(() => import('./ViewManager'));
```

Merge `lazy` and `Suspense` into the existing `react` import rather than adding a second one.

Add state beside `period` and `category`:

```tsx
  const [views, setViews] = useState<View[]>(() => loadViews());
  // Not persisted: a remembered filter that hides data is a footgun, and this
  // one would survive a restart with no obvious cause.
  const [activeViewId, setActiveViewId] = useState<string>(ALL_VIEW_ID);
  const [managerOpen, setManagerOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(() => loadInsightsOpen());
```

- [ ] **Step 2: Add the view to the filter chain**

Replace the memo block (currently lines 62–67) with:

```tsx
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
  const balance = useMemo(() => computeBalance(transactions), [transactions]);
```

`balance` stays over all transactions — it is the one all-time figure on the screen, and a balance scoped to three categories is not a balance.

- [ ] **Step 3: Scope the trend to the view**

Replace the `trend` memo (currently line 79):

```tsx
  // Scoped to the view like the totals it sits above: a global sentence over
  // view-scoped numbers would describe a different set of transactions.
  const trend = useMemo(
    () => computeSpendingTrend(applyView(transactions, activeView), todayISO),
    [transactions, activeView, todayISO]
  );
```

Note it still reads full history, not `periodScoped` — the trend compares this calendar month with last, whatever period is displayed.

- [ ] **Step 4: Add the view handlers**

After `selectCategory`:

```tsx
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
  const persistViews = useCallback(
    (next: View[]) => {
      setViews(next);
      saveViews(next);
      setActiveViewId((current) =>
        current === ALL_VIEW_ID || next.some((v) => v.id === current) ? current : ALL_VIEW_ID
      );
    },
    []
  );

  const toggleInsights = useCallback((open: boolean) => {
    setInsightsOpen(open);
    saveInsightsOpen(open);
  }, []);
```

- [ ] **Step 5: Add the view empty state**

Replace the `emptyKey` block (currently lines 111–117):

```tsx
  const emptyKey: TranslationKey = category
    ? 'emptyCategoryFiltered'
    : transactions.length === 0
      ? 'emptyTransactions'
      : activeViewId !== ALL_VIEW_ID
        ? 'emptyViewFiltered'
        : period.kind === 'date'
          ? 'emptyDayFiltered'
          : 'emptyPeriodFiltered';
```

The view case sits above the period cases because it is the more specific reason the list is empty — telling someone "nothing this month" when they are looking through a three-category view would send them to change the wrong control.

- [ ] **Step 6: Restructure the JSX**

Replace the returned JSX with:

```tsx
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
```

- [ ] **Step 7: Verify**

```bash
pnpm typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK=$?"
pnpm test > /tmp/t.log 2>&1; echo "TEST=$?"
pnpm build > /tmp/b.log 2>&1; echo "BUILD=$?"
```

(In fish, use `$status` instead of `$?`.) All three must print 0. Do not pipe these through `tail` — the pipe masks the exit code and a failure will look like a pass.

- [ ] **Step 8: Manual verification**

Run `pnpm dev` and walk through this list. None of it is unit-testable in this repo, so it is the only coverage these components get.

**View tabs**
1. Fresh state: only the "All" tab and the "⋯" button appear.
2. "⋯" → "New view" → name "Daily needs", type Expenses, pick Food and Transport → save. The tab appears and the modal returns to the list.
3. Select "Daily needs": the summary's expense total, the list, and the chip row all narrow to those categories. The **balance is unchanged**.
4. Expand Insights: the breakdown shows only those categories; the heatmap still shows all activity.
5. Create a second view with type Income and **no categories** — confirm it shows every income transaction.
6. With a view active, pick a category chip: it narrows further. Switch tabs: the chip clears.
7. Reorder with ↑/↓ — the tab order changes to match.
8. Delete the active view: the screen falls back to All rather than showing an empty filtered list.
9. Reload the page: views persist, and the active tab is back to All.

**Insights and the period bar**
10. On load, Insights is collapsed and the first transaction is visible much closer to the top.
11. Expand it, reload — it stays expanded. Collapse, reload — it stays collapsed.
12. Pick a day with the date input: the summary, list and chips scope to that day.
13. Clear the date input: you return to the month that day was in, **not** the current month.
14. The date input refuses dates after today.
15. Expand Insights and click a heatmap cell — it selects the same day and the date input updates to match.

**Both languages**
16. Switch to Bahasa Indonesia and confirm the tab bar, manager, form and Insights summary are all translated, including the "All" tab label.

- [ ] **Step 9: Commit**

```bash
git add src/features/transactions/TransactionsScreen.tsx
git commit -m "feat: add view tabs and collapse insights on the transaction page"
```

---

## Notes for the implementer

**Do not trim view categories.** `UNCATEGORIZED` is `' uncategorized'` with a leading space (`categoryChips.ts:19`), deliberately collision-proof because real categories are trimmed. Only the transaction side is normalized; view entries are stored exactly as the picker supplied them. Trimming them would silently unclaim every blank-category row, and no test would catch it unless you kept the sentinel test in Task 1.

**`balance` and the heatmap stay global on purpose.** So does `unallocated` — it is balance minus what the envelopes hold, and scoping one side of a subtraction produces a number that means nothing.

**The active view is intentionally not persisted.** If you find yourself adding it "for convenience", re-read the spec: a filter that hides data and survives a restart is how users conclude their transactions have vanished.

**No `AppShell` changes.** `TransactionsScreenProps` is unchanged, and `ViewManager` is rendered from `TransactionsScreen` rather than `AppShell` — deliberately, since views are a transactions-screen concern that nothing else reads and `AppShell` already carries ten modals.
