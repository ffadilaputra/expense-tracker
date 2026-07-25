# Personal Finance Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-first personal finance tracker (income/expense transactions, spending heatmap, IDR, EN/ID) on the recipe-app engine, backed by a user-owned Google Sheet.

**Architecture:** Port recipe-app's generic offline-first sync engine (localStorage cache + FIFO sync queue + Apps Script backend) unchanged, and replace the recipe domain with a transaction domain. One screen (summary + heatmap + date-grouped list) plus a FAB-triggered Add/Edit form. Two net-new pure modules (`money`, `heatmap`) plus pure `summary`/`dateGroups` helpers get unit tests; the sync store is ported with only its payload type changed.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest (new), hand-written CSS, Google Apps Script + Google Sheets, PWA (service worker + manifest).

**Source to port from:** `/Users/fflatburger/Workspace/recipe-app` (referred to below as `$RECIPE`). The new project root is `/Users/fflatburger/Workspace/finance-app` (referred to as `$ROOT`; all `src/...` paths are relative to it).

## Global Constraints

- Package manager: **pnpm**. Node scripts: `dev`, `build`, `preview`, `typecheck`, `test`.
- React 18.3.x, TypeScript 5.5.x, Vite 5.4.x — match recipe-app's versions exactly.
- **No runtime dependencies beyond `react` + `react-dom`.** No axios, no date library, no i18n library, no icon library, no charting library. Everything is hand-written (matches recipe-app).
- Currency is **IDR only**, integers (no decimal subunit). All amounts formatted through `utils/money.ts` — never inline `toLocaleString`/string concat elsewhere.
- Languages: **English (`en`, default) and Bahasa Indonesia (`id`)**. Every user-facing string goes through the i18n `t()` function; add both locales for every key.
- localStorage namespace prefix: **`finance:`** (recipe-app used `oma-recipe:`). Every storage key uses this prefix.
- Apps Script response envelope is always `{ success: boolean, data?: T, error?: string }`.
- POST requests use `Content-Type: text/plain;charset=utf-8` to avoid a CORS preflight (Apps Script requirement — do not change this).
- Amount inputs must be `inputMode="numeric"`; touch targets stay finger-sized on all viewports.

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `$ROOT/package.json`, `$ROOT/tsconfig.json`, `$ROOT/tsconfig.node.json`, `$ROOT/vite.config.ts`, `$ROOT/vitest.config.ts`, `$ROOT/.gitignore`, `$ROOT/index.html`, `$ROOT/src/main.tsx`, `$ROOT/src/App.tsx`, `$ROOT/src/vite-env.d.ts`, `$ROOT/src/index.css`
- Copy (binary/asset): `$ROOT/public/manifest.webmanifest`, `$ROOT/public/sw.js`, `$ROOT/public/icons/*`, `$ROOT/netlify.toml`

**Interfaces:**
- Produces: a booting Vite app rendering a placeholder, and a working `pnpm test` (Vitest) runner that later tasks depend on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "finance-app",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Copy build config from recipe-app unchanged**

Copy these files verbatim (they contain no recipe-specific content):
```bash
cp $RECIPE/tsconfig.json        $ROOT/tsconfig.json
cp $RECIPE/tsconfig.node.json   $ROOT/tsconfig.node.json
cp $RECIPE/vite.config.ts       $ROOT/vite.config.ts
cp $RECIPE/.gitignore           $ROOT/.gitignore
cp $RECIPE/netlify/netlify.toml $ROOT/netlify.toml 2>/dev/null || mkdir -p $ROOT/netlify && cp $RECIPE/netlify/netlify.toml $ROOT/netlify/netlify.toml
cp -r $RECIPE/public/icons       $ROOT/public/icons
cp $RECIPE/public/sw.js          $ROOT/public/sw.js
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts']
  }
});
```

- [ ] **Step 4: Create `public/manifest.webmanifest`**

```json
{
  "name": "Uang — Personal Finance",
  "short_name": "Uang",
  "description": "Track income and expenses in your own Google Sheet — works offline.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#16282a",
  "theme_color": "#111111",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#111111" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icons/icon-192.png" type="image/png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Uang" />
    <title>Uang — Personal Finance</title>
    <meta name="description" content="Track income and expenses in your own Google Sheet — works offline." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Create a placeholder `src/App.tsx`**

```tsx
export default function App() {
  return <div className="app-boot">Uang — scaffold OK</div>;
}
```

- [ ] **Step 8: Create a minimal `src/main.tsx`** (providers get added in Task 14)

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

- [ ] **Step 9: Create a minimal `src/index.css`** (full styling lands in Task 15)

```css
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.app-boot { padding: 2rem; }
```

- [ ] **Step 10: Install and verify dev + build + test**

Run:
```bash
cd $ROOT && pnpm install && pnpm typecheck && pnpm build && pnpm test
```
Expected: `pnpm typecheck` and `pnpm build` succeed; `pnpm test` reports "No test files found" (exit 0 is fine at this stage — Vitest with no matches exits 0).

- [ ] **Step 11: Commit**

```bash
cd $ROOT && git add -A && git commit -m "chore: scaffold finance-app (vite + react + ts + vitest + pwa)"
```

---

## Task 2: money.ts (currency formatting/parsing, TDD)

**Files:**
- Create: `src/utils/money.ts`
- Test: `src/utils/money.test.ts`

**Interfaces:**
- Produces:
  - `formatIDR(n: number): string` — `1250000 → "Rp 1.250.000"`, negatives as `-Rp 1.000`, `0 → "Rp 0"`.
  - `parseAmount(input: string): number` — strips non-digits, returns a non-negative integer, `0` for empty/invalid.
- Consumed by: Task 8 (SpendingHeatmap legend), Task 9 (Summary), Task 10 (TransactionCard), Task 12 (TransactionForm).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { formatIDR, parseAmount } from './money';

describe('formatIDR', () => {
  it('groups thousands with dots and prefixes Rp', () => {
    expect(formatIDR(1250000)).toBe('Rp 1.250.000');
  });
  it('formats zero', () => {
    expect(formatIDR(0)).toBe('Rp 0');
  });
  it('formats small values without separators', () => {
    expect(formatIDR(500)).toBe('Rp 500');
  });
  it('places the minus sign before Rp for negatives', () => {
    expect(formatIDR(-1000)).toBe('-Rp 1.000');
  });
  it('rounds non-integer input', () => {
    expect(formatIDR(1000.7)).toBe('Rp 1.001');
  });
});

describe('parseAmount', () => {
  it('strips grouping dots', () => {
    expect(parseAmount('1.250.000')).toBe(1250000);
  });
  it('strips a currency prefix and spaces', () => {
    expect(parseAmount('Rp 25.000')).toBe(25000);
  });
  it('returns 0 for empty input', () => {
    expect(parseAmount('')).toBe(0);
  });
  it('returns 0 for non-numeric input', () => {
    expect(parseAmount('abc')).toBe(0);
  });
  it('round-trips with formatIDR', () => {
    expect(parseAmount(formatIDR(1250000))).toBe(1250000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd $ROOT && pnpm vitest run src/utils/money.test.ts`
Expected: FAIL — cannot resolve `./money`.

- [ ] **Step 3: Write the implementation**

```ts
// Single source of truth for turning a stored integer amount (Indonesian
// Rupiah, no decimal subunit) into display text and back. Everything that
// shows or reads a money value goes through here so grouping and the "Rp"
// prefix never drift between the form, the list, and the summary.

const GROUPER = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** `1250000` → `"Rp 1.250.000"`. Negatives read as `-Rp 1.000`. */
export function formatIDR(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}Rp ${GROUPER.format(Math.abs(rounded))}`;
}

/**
 * `"Rp 1.250.000"` / `"1.250.000"` → `1250000`. Keeps only digits, so any
 * prefix, spaces, or grouping separators the user (or the formatter) added
 * are ignored. Empty or non-numeric input is a valid "nothing entered yet"
 * state, so it returns 0 rather than NaN.
 */
export function parseAmount(input: string): number {
  const digits = input.replace(/\D/g, '');
  if (digits === '') return 0;
  const value = Number.parseInt(digits, 10);
  return Number.isNaN(value) ? 0 : value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd $ROOT && pnpm vitest run src/utils/money.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
cd $ROOT && git add src/utils/money.ts src/utils/money.test.ts && git commit -m "feat: add IDR money formatting/parsing"
```

---

## Task 3: Domain types + category presets

**Files:**
- Create: `src/types.ts`, `src/config/categories.ts`

**Interfaces:**
- Produces:
  - `Transaction`, `TransactionFormData`, `TransactionType`, `QueueEntry`, `SyncOperation`, `ApiEnvelope<T>`.
  - `EXPENSE_CATEGORIES: string[]`, `INCOME_CATEGORIES: string[]`, `categoriesFor(type: TransactionType): string[]`.
- Consumed by: nearly every later task.

- [ ] **Step 1: Create `src/types.ts`**

```ts
// One shared shape for a transaction, used by the API layer, the offline
// store, and the UI so they never drift apart.

export type TransactionType = 'income' | 'expense';

/** A transaction as stored in Google Sheets / the local cache. */
export interface Transaction {
  id: string;
  type: TransactionType;
  /** IDR, integer (no decimal subunit). Always >= 0; direction is `type`. */
  amount: number;
  category: string;
  /** ISO calendar date (yyyy-mm-dd) the money moved — user chosen. */
  date: string;
  note?: string;
  /** ISO timestamp set when the row was first created. */
  createdAt: string;
  /** True while this row has offline changes not yet pushed to the sheet. */
  _pending?: boolean;
}

/** The fields a user actually edits in the form. */
export type TransactionFormData = Omit<Transaction, 'id' | 'createdAt' | '_pending'>;

export type SyncOperation = 'add' | 'update' | 'delete';

/** A queued change waiting to be pushed to Google Sheets once back online. */
export interface QueueEntry {
  type: SyncOperation;
  id: string;
  payload: Partial<TransactionFormData> | null;
}

/** Shape returned by every Apps Script endpoint. */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

- [ ] **Step 2: Create `src/config/categories.ts`**

```ts
import type { TransactionType } from '../types';

// Default categories offered in the form's datalist. They are suggestions,
// not a fixed set: the category field is free text, so the user can type a
// new one and it is stored as-is. Kept as plain English identifiers; the
// display layer can localize later if needed (out of scope for v1).

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Shopping',
  'Health',
  'Entertainment'
];

export const INCOME_CATEGORIES = ['Salary', 'Bonus', 'Gift'];

export function categoriesFor(type: TransactionType): string[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd $ROOT && git add src/types.ts src/config/categories.ts && git commit -m "feat: add transaction types and category presets"
```

---

## Task 4: summary + dateGroups pure helpers (TDD)

**Files:**
- Create: `src/utils/summary.ts`, `src/utils/dateGroups.ts`
- Test: `src/utils/summary.test.ts`, `src/utils/dateGroups.test.ts`

**Interfaces:**
- Produces:
  - `computeBalance(txns: Transaction[]): number` — sum(income) − sum(expense).
  - `computeMonthTotals(txns: Transaction[], refISODate: string): { income: number; expense: number }` — totals whose `date` is in the same year+month as `refISODate`.
  - `groupByDate(txns: Transaction[]): DateGroup[]` where `DateGroup = { date: string; items: Transaction[] }`, groups sorted date-descending, items within a group sorted `createdAt`-descending.
  - `relativeDay(dateISO: string, todayISO: string): 'today' | 'yesterday' | null`.
- Consumed by: Task 9 (Summary), Task 10 (TransactionList).

- [ ] **Step 1: Write the failing tests for summary**

`src/utils/summary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeBalance, computeMonthTotals } from './summary';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('computeBalance', () => {
  it('is income minus expense', () => {
    const txns = [
      tx({ type: 'income', amount: 5000000 }),
      tx({ type: 'expense', amount: 2000000 }),
      tx({ type: 'expense', amount: 500000 })
    ];
    expect(computeBalance(txns)).toBe(2500000);
  });
  it('is zero for no transactions', () => {
    expect(computeBalance([])).toBe(0);
  });
});

describe('computeMonthTotals', () => {
  it('sums only transactions in the reference month', () => {
    const txns = [
      tx({ type: 'income', amount: 5000000, date: '2026-07-25' }),
      tx({ type: 'expense', amount: 2000000, date: '2026-07-10' }),
      tx({ type: 'expense', amount: 999, date: '2026-06-30' }),
      tx({ type: 'income', amount: 111, date: '2026-08-01' })
    ];
    expect(computeMonthTotals(txns, '2026-07-25')).toEqual({ income: 5000000, expense: 2000000 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd $ROOT && pnpm vitest run src/utils/summary.test.ts`
Expected: FAIL — cannot resolve `./summary`.

- [ ] **Step 3: Implement `src/utils/summary.ts`**

```ts
import type { Transaction } from '../types';

/** All-time balance: everything earned minus everything spent. */
export function computeBalance(txns: Transaction[]): number {
  return txns.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
}

/** Year+month prefix of an ISO date, e.g. "2026-07-25" -> "2026-07". */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Income and expense totals for the month containing `refISODate`. */
export function computeMonthTotals(
  txns: Transaction[],
  refISODate: string
): { income: number; expense: number } {
  const key = monthKey(refISODate);
  return txns.reduce(
    (acc, t) => {
      if (monthKey(t.date) !== key) return acc;
      if (t.type === 'income') acc.income += t.amount;
      else acc.expense += t.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd $ROOT && pnpm vitest run src/utils/summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for dateGroups**

`src/utils/dateGroups.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { groupByDate, relativeDay } from './dateGroups';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('groupByDate', () => {
  it('groups by date, newest date first, newest createdAt first within a day', () => {
    const a = tx({ id: 'a', date: '2026-07-24', createdAt: '2026-07-24T08:00:00.000Z' });
    const b = tx({ id: 'b', date: '2026-07-25', createdAt: '2026-07-25T09:00:00.000Z' });
    const c = tx({ id: 'c', date: '2026-07-25', createdAt: '2026-07-25T18:00:00.000Z' });
    const groups = groupByDate([a, b, c]);
    expect(groups.map((g) => g.date)).toEqual(['2026-07-25', '2026-07-24']);
    expect(groups[0].items.map((t) => t.id)).toEqual(['c', 'b']);
  });
  it('returns empty array for no transactions', () => {
    expect(groupByDate([])).toEqual([]);
  });
});

describe('relativeDay', () => {
  it('detects today', () => {
    expect(relativeDay('2026-07-25', '2026-07-25')).toBe('today');
  });
  it('detects yesterday', () => {
    expect(relativeDay('2026-07-24', '2026-07-25')).toBe('yesterday');
  });
  it('returns null for older dates', () => {
    expect(relativeDay('2026-07-01', '2026-07-25')).toBeNull();
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd $ROOT && pnpm vitest run src/utils/dateGroups.test.ts`
Expected: FAIL — cannot resolve `./dateGroups`.

- [ ] **Step 7: Implement `src/utils/dateGroups.ts`**

```ts
import type { Transaction } from '../types';

export interface DateGroup {
  /** ISO calendar date (yyyy-mm-dd). */
  date: string;
  items: Transaction[];
}

/**
 * Group transactions by their calendar date. Groups are ordered newest date
 * first; within a group, rows are ordered by createdAt so the most recently
 * entered transaction sits on top even when several share a date.
 */
export function groupByDate(txns: Transaction[]): DateGroup[] {
  const byDate = new Map<string, Transaction[]>();
  for (const t of txns) {
    const bucket = byDate.get(t.date);
    if (bucket) bucket.push(t);
    else byDate.set(t.date, [t]);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, items]) => ({
      date,
      items: items.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    }));
}

/** Compares two ISO dates as "today", "yesterday", or neither. */
export function relativeDay(dateISO: string, todayISO: string): 'today' | 'yesterday' | null {
  if (dateISO === todayISO) return 'today';
  const yesterday = new Date(`${todayISO}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dateISO === yesterday.toISOString().slice(0, 10)) return 'yesterday';
  return null;
}
```

- [ ] **Step 8: Run to verify pass**

Run: `cd $ROOT && pnpm vitest run src/utils/summary.test.ts src/utils/dateGroups.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd $ROOT && git add src/utils/summary.ts src/utils/summary.test.ts src/utils/dateGroups.ts src/utils/dateGroups.test.ts && git commit -m "feat: add balance/month-total and date-grouping helpers"
```

---

## Task 5: heatmap.ts (spending heatmap bucketing, TDD)

**Files:**
- Create: `src/utils/heatmap.ts`
- Test: `src/utils/heatmap.test.ts`

**Interfaces:**
- Produces:
  - `computeDailyExpenseTotals(txns: Transaction[]): Map<string, number>` — sums `expense` amounts by `date` (income ignored).
  - `computeThresholds(nonzeroTotals: number[]): [number, number, number, number]` — ascending quartile-ish cut points; `[0,0,0,0]` when input is empty.
  - `levelFor(total: number, thresholds: [number, number, number, number]): 0 | 1 | 2 | 3 | 4` — `0` when `total <= 0`.
  - `HeatCell = { date: string | null; total: number; level: number }`.
  - `buildHeatmap(txns: Transaction[], weeks: number, todayISO: string): HeatCell[][]` — array of week-columns (each length 7, Sun..Sat), oldest week first, leading days before the range are `{ date: null, total: 0, level: 0 }`.
- Consumed by: Task 8 (SpendingHeatmap).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  computeDailyExpenseTotals,
  computeThresholds,
  levelFor,
  buildHeatmap
} from './heatmap';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x', type: 'expense', amount: 0, category: '', date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z', ...partial
  };
}

describe('computeDailyExpenseTotals', () => {
  it('sums expenses per date and ignores income', () => {
    const totals = computeDailyExpenseTotals([
      tx({ date: '2026-07-01', amount: 10000 }),
      tx({ date: '2026-07-01', amount: 5000 }),
      tx({ date: '2026-07-02', type: 'income', amount: 999999 })
    ]);
    expect(totals.get('2026-07-01')).toBe(15000);
    expect(totals.has('2026-07-02')).toBe(false);
  });
});

describe('computeThresholds', () => {
  it('returns ascending cut points', () => {
    const t = computeThresholds([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(t[0]).toBeLessThanOrEqual(t[1]);
    expect(t[1]).toBeLessThanOrEqual(t[2]);
    expect(t[2]).toBeLessThanOrEqual(t[3]);
  });
  it('is all zeros when empty', () => {
    expect(computeThresholds([])).toEqual([0, 0, 0, 0]);
  });
});

describe('levelFor', () => {
  const thresholds: [number, number, number, number] = [10, 20, 30, 40];
  it('is 0 for no spend', () => {
    expect(levelFor(0, thresholds)).toBe(0);
  });
  it('is 1 at or below the first threshold', () => {
    expect(levelFor(10, thresholds)).toBe(1);
  });
  it('is 4 above the top threshold', () => {
    expect(levelFor(999, thresholds)).toBe(4);
  });
});

describe('buildHeatmap', () => {
  it('produces `weeks` columns of 7 days each ending at today', () => {
    const grid = buildHeatmap([tx({ date: '2026-07-25', amount: 50000 })], 4, '2026-07-25');
    expect(grid.length).toBe(4);
    expect(grid.every((col) => col.length === 7)).toBe(true);
    // today (2026-07-25 is a Saturday) is the last cell of the last column
    const last = grid[grid.length - 1][6];
    expect(last.date).toBe('2026-07-25');
    expect(last.level).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd $ROOT && pnpm vitest run src/utils/heatmap.test.ts`
Expected: FAIL — cannot resolve `./heatmap`.

- [ ] **Step 3: Implement `src/utils/heatmap.ts`**

```ts
import type { Transaction } from '../types';

export interface HeatCell {
  /** null for padding cells before the start of the range. */
  date: string | null;
  total: number;
  level: number;
}

/** Sum expense amounts by calendar date; income does not shade the grid. */
export function computeDailyExpenseTotals(txns: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== 'expense') continue;
    totals.set(t.date, (totals.get(t.date) ?? 0) + t.amount);
  }
  return totals;
}

/**
 * Four ascending cut points at the 20/40/60/80 percentiles of the nonzero
 * daily spend, so shading adapts to the user's own spending scale rather than
 * a fixed rupiah amount. Empty input yields all zeros (every day renders as
 * level 0 or, if it has any spend, level 4 — see levelFor).
 */
export function computeThresholds(nonzeroTotals: number[]): [number, number, number, number] {
  if (nonzeroTotals.length === 0) return [0, 0, 0, 0];
  const sorted = nonzeroTotals.slice().sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return [at(0.2), at(0.4), at(0.6), at(0.8)];
}

/** Bucket a daily total into 0 (none) or 1..4 by the given thresholds. */
export function levelFor(
  total: number,
  thresholds: [number, number, number, number]
): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0) return 0;
  if (total <= thresholds[0]) return 1;
  if (total <= thresholds[1]) return 2;
  if (total <= thresholds[2]) return 3;
  return 4;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a GitHub-style grid: `weeks` columns, each a Sun..Sat run of 7 days,
 * with the column containing `todayISO` last. Days before the range start are
 * padding cells (date: null). Shading levels are computed from the whole
 * range's nonzero daily spend so the scale is stable across the grid.
 */
export function buildHeatmap(
  txns: Transaction[],
  weeks: number,
  todayISO: string
): HeatCell[][] {
  const totals = computeDailyExpenseTotals(txns);

  // Last column ends on the Saturday of today's week.
  const todayDow = new Date(`${todayISO}T00:00:00Z`).getUTCDay(); // 0=Sun
  const lastCellISO = addDays(todayISO, 6 - todayDow);
  const firstCellISO = addDays(lastCellISO, -(weeks * 7 - 1));

  const rangeTotals: number[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const iso = addDays(firstCellISO, i);
    const total = totals.get(iso) ?? 0;
    if (total > 0) rangeTotals.push(total);
  }
  const thresholds = computeThresholds(rangeTotals);

  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(firstCellISO, w * 7 + d);
      if (iso > todayISO) {
        col.push({ date: null, total: 0, level: 0 });
        continue;
      }
      const total = totals.get(iso) ?? 0;
      col.push({ date: iso, total, level: levelFor(total, thresholds) });
    }
    grid.push(col);
  }
  return grid;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd $ROOT && pnpm vitest run src/utils/heatmap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd $ROOT && git add src/utils/heatmap.ts src/utils/heatmap.test.ts && git commit -m "feat: add spending heatmap bucketing"
```

---

## Task 6: Port the domain-agnostic infra (config, hooks, i18n system)

These files contain no recipe-specific logic. Copy them, apply the exact edits listed, and they work unchanged.

**Files:**
- Create (copy + edit): `src/config/apiUrl.ts`, `src/hooks/useOnlineStatus.ts`, `src/hooks/usePullToRefresh.ts`, `src/hooks/useInstallPrompt.ts`, `src/i18n/locale.ts`, `src/i18n/translate.ts`, `src/i18n/context.tsx`

**Interfaces:**
- Produces: `getStoredApiUrl`, `setStoredApiUrl`, `clearStoredApiUrl`, `isValidAppsScriptUrl` (apiUrl); `useOnlineStatus`, `usePullToRefresh`, `useInstallPrompt`; `getStoredLocale`, `setStoredLocale`, `Locale`; `translate`; `I18nProvider`, `useI18n`.
- Consumed by: Tasks 7–14.

- [ ] **Step 1: Copy the three hooks verbatim**

```bash
cp $RECIPE/src/hooks/useOnlineStatus.ts   $ROOT/src/hooks/useOnlineStatus.ts
cp $RECIPE/src/hooks/usePullToRefresh.ts  $ROOT/src/hooks/usePullToRefresh.ts
cp $RECIPE/src/hooks/useInstallPrompt.ts  $ROOT/src/hooks/useInstallPrompt.ts
```
These have no recipe-specific content and need no edits.

- [ ] **Step 2: Copy `apiUrl.ts` and rename its storage key**

```bash
cp $RECIPE/src/config/apiUrl.ts $ROOT/src/config/apiUrl.ts
```
Then edit `$ROOT/src/config/apiUrl.ts`: change the key constant line
```ts
const API_URL_KEY = 'oma-recipe:api-url';
```
to
```ts
const API_URL_KEY = 'finance:api-url';
```

- [ ] **Step 3: Copy `translate.ts` and `context.tsx` verbatim**

```bash
cp $RECIPE/src/i18n/translate.ts $ROOT/src/i18n/translate.ts
cp $RECIPE/src/i18n/context.tsx  $ROOT/src/i18n/context.tsx
```
These reference `./translations` (created in Task 7) and `./locale` — no edits needed.

- [ ] **Step 4: Copy `locale.ts` and rename its storage key**

```bash
cp $RECIPE/src/i18n/locale.ts $ROOT/src/i18n/locale.ts
```
Then edit `$ROOT/src/i18n/locale.ts`: change
```ts
const LOCALE_KEY = 'oma-recipe:locale';
```
to
```ts
const LOCALE_KEY = 'finance:locale';
```

- [ ] **Step 5: Note — do not typecheck yet**

`context.tsx`/`translate.ts` import `./translations`, which is created in Task 7. Typecheck runs at the end of Task 7. Commit now.

- [ ] **Step 6: Commit**

```bash
cd $ROOT && git add src/config/apiUrl.ts src/hooks/useOnlineStatus.ts src/hooks/usePullToRefresh.ts src/hooks/useInstallPrompt.ts src/i18n/locale.ts src/i18n/translate.ts src/i18n/context.tsx && git commit -m "chore: port config, hooks, and i18n system from recipe-app"
```

---

## Task 7: Translations (EN + ID) for the finance domain

**Files:**
- Create: `src/i18n/translations.ts`

**Interfaces:**
- Produces: `en`, `id`, `translations`, `TranslationKey`. Every key used anywhere in the UI is defined here in both locales.
- Consumed by: `translate.ts`, `context.tsx`, and all components.

- [ ] **Step 1: Create `src/i18n/translations.ts`**

```ts
// One plain object per language — no i18n library. TypeScript checks every
// t('key') against `en`, and `id` must satisfy the same key set (enforced by
// the `Record<TranslationKey, string>` annotation), so a missing translation
// is a compile error.

export const en = {
  appTitle: 'Uang',
  loginTagline: 'Track income and expenses in your own Google Sheet — still works offline.',
  changeSheetLabel: 'Switch Google Sheet',
  changeSheetConfirm: 'Switch Google Sheet? The data cached on this device will be cleared.',
  dismissNotification: 'Dismiss notification',
  loadingGeneric: 'Loading...',
  loadingForm: 'Loading form...',

  // Summary
  balanceLabel: 'Balance',
  monthIncomeLabel: 'Income this month',
  monthExpenseLabel: 'Expense this month',

  // Heatmap
  heatmapTitle: 'Spending',
  heatmapLess: 'less',
  heatmapMore: 'more',
  heatmapDayTotal: '{date}: {amount}',
  heatmapClearFilter: 'Show all days',

  // List
  emptyTransactions: 'No transactions yet. Tap + to add your first one.',
  emptyDayFiltered: 'No transactions on this day.',
  relativeToday: 'Today',
  relativeYesterday: 'Yesterday',
  pendingTag: 'Not synced',
  deleteTransactionConfirm: 'Delete this transaction?',

  // Form
  addTitle: 'Add transaction',
  editTitle: 'Edit transaction',
  typeIncome: 'Income',
  typeExpense: 'Expense',
  fieldAmount: 'Amount',
  amountPlaceholder: '0',
  fieldCategory: 'Category',
  categoryPlaceholder: 'e.g. Food, Salary',
  fieldDate: 'Date',
  fieldNote: 'Note (optional)',
  notePlaceholder: 'e.g. Lunch with team',
  saveBtn: 'Save',
  savingBtn: 'Saving...',
  updateBtn: 'Update',
  cancelBtn: 'Cancel',
  deleteBtn: 'Delete',
  addFabLabel: 'Add transaction',

  // Sync
  syncOnline: 'Online',
  syncOffline: 'Offline',
  syncPendingChanges: '{count} pending',
  syncNowBtn: 'Sync now',
  syncSyncing: 'Syncing...',

  // Install prompt
  installPromptText: 'Add Uang to your home screen',
  installBtn: 'Install',
  installDismiss: 'Not now',

  // Login
  webAppUrlLabel: 'Google Apps Script Web App URL',
  connectBtn: 'Connect',
  connecting: 'Connecting...',
  invalidUrlError: 'That does not look like an Apps Script Web App URL (should end in /exec).',
  helpSummary: 'How do I get this URL?',
  helpStep1: 'Create a Google Sheet you will own.',
  helpStep2: 'Open Extensions → Apps Script and paste the Code.gs from this project.',
  helpStep3: 'Deploy → New deployment → Web app, access "Anyone".',
  helpStep4: 'Copy the Web App URL (ends in /exec) and paste it above.',

  // Errors (used outside React by sheetApi)
  errNotConnected: 'Not connected to a Google Sheet yet.',
  errFetchFailed: 'Could not load transactions.',
  errActionFailed: 'The "{action}" action failed.',
  errVerifyNetwork: 'Could not reach that URL. Check your connection and the URL.',
  errVerifyStatus: 'The URL responded with status {status}.',
  errVerifyInvalid: 'That URL is not a valid deployment for this app.'
} as const;

export type TranslationKey = keyof typeof en;

export const id: Record<TranslationKey, string> = {
  appTitle: 'Uang',
  loginTagline: 'Catat pemasukan dan pengeluaran di Google Sheet milikmu — tetap jalan offline.',
  changeSheetLabel: 'Ganti Google Sheet',
  changeSheetConfirm: 'Ganti Google Sheet? Data yang tersimpan di perangkat ini akan dihapus.',
  dismissNotification: 'Tutup notifikasi',
  loadingGeneric: 'Memuat...',
  loadingForm: 'Memuat formulir...',

  balanceLabel: 'Saldo',
  monthIncomeLabel: 'Pemasukan bulan ini',
  monthExpenseLabel: 'Pengeluaran bulan ini',

  heatmapTitle: 'Pengeluaran',
  heatmapLess: 'sedikit',
  heatmapMore: 'banyak',
  heatmapDayTotal: '{date}: {amount}',
  heatmapClearFilter: 'Tampilkan semua hari',

  emptyTransactions: 'Belum ada transaksi. Ketuk + untuk menambahkan.',
  emptyDayFiltered: 'Tidak ada transaksi pada hari ini.',
  relativeToday: 'Hari ini',
  relativeYesterday: 'Kemarin',
  pendingTag: 'Belum tersinkron',
  deleteTransactionConfirm: 'Hapus transaksi ini?',

  addTitle: 'Tambah transaksi',
  editTitle: 'Ubah transaksi',
  typeIncome: 'Pemasukan',
  typeExpense: 'Pengeluaran',
  fieldAmount: 'Jumlah',
  amountPlaceholder: '0',
  fieldCategory: 'Kategori',
  categoryPlaceholder: 'mis. Makan, Gaji',
  fieldDate: 'Tanggal',
  fieldNote: 'Catatan (opsional)',
  notePlaceholder: 'mis. Makan siang bersama tim',
  saveBtn: 'Simpan',
  savingBtn: 'Menyimpan...',
  updateBtn: 'Perbarui',
  cancelBtn: 'Batal',
  deleteBtn: 'Hapus',
  addFabLabel: 'Tambah transaksi',

  syncOnline: 'Online',
  syncOffline: 'Offline',
  syncPendingChanges: '{count} menunggu',
  syncNowBtn: 'Sinkron sekarang',
  syncSyncing: 'Menyinkronkan...',

  installPromptText: 'Tambahkan Uang ke layar utama',
  installBtn: 'Pasang',
  installDismiss: 'Nanti',

  webAppUrlLabel: 'URL Web App Google Apps Script',
  connectBtn: 'Hubungkan',
  connecting: 'Menghubungkan...',
  invalidUrlError: 'Itu tidak tampak seperti URL Web App Apps Script (harus diakhiri /exec).',
  helpSummary: 'Bagaimana cara mendapatkan URL ini?',
  helpStep1: 'Buat Google Sheet milikmu sendiri.',
  helpStep2: 'Buka Ekstensi → Apps Script dan tempel Code.gs dari proyek ini.',
  helpStep3: 'Deploy → New deployment → Web app, akses "Anyone".',
  helpStep4: 'Salin URL Web App (diakhiri /exec) dan tempel di atas.',

  errNotConnected: 'Belum terhubung ke Google Sheet.',
  errFetchFailed: 'Tidak dapat memuat transaksi.',
  errActionFailed: 'Aksi "{action}" gagal.',
  errVerifyNetwork: 'Tidak dapat menjangkau URL itu. Periksa koneksi dan URL-nya.',
  errVerifyStatus: 'URL merespons dengan status {status}.',
  errVerifyInvalid: 'URL itu bukan deployment yang valid untuk aplikasi ini.'
};

export const translations = { en, id };
```

- [ ] **Step 2: Verify typecheck (i18n system now resolves)**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd $ROOT && git add src/i18n/translations.ts && git commit -m "feat: add EN/ID translations for finance domain"
```

---

## Task 8: Port localCache for transactions

**Files:**
- Create (copy + edit): `src/offline/localCache.ts`

**Interfaces:**
- Consumes: `Transaction`, `QueueEntry` (Task 3).
- Produces: `loadCachedTransactions`, `saveCachedTransactions`, `loadQueue`, `saveQueue`, `makeLocalId`, `isLocalId`, `clearCache`.
- Consumed by: Task 9 (store).

- [ ] **Step 1: Copy the file**

```bash
cp $RECIPE/src/offline/localCache.ts $ROOT/src/offline/localCache.ts
```

- [ ] **Step 2: Apply these exact edits to `$ROOT/src/offline/localCache.ts`**

- Change the import line
  ```ts
  import type { QueueEntry, Recipe } from '../types';
  ```
  to
  ```ts
  import type { QueueEntry, Transaction } from '../types';
  ```
- Change the key constants
  ```ts
  const RECIPES_KEY = 'oma-recipe:recipes';
  const QUEUE_KEY = 'oma-recipe:queue';
  ```
  to
  ```ts
  const TRANSACTIONS_KEY = 'finance:transactions';
  const QUEUE_KEY = 'finance:queue';
  ```
- Rename the cache variable and its two functions:
  ```ts
  let recipesCache: Recipe[] | null = null;
  ```
  →
  ```ts
  let transactionsCache: Transaction[] | null = null;
  ```
  ```ts
  export function loadCachedRecipes(): Recipe[] {
    if (recipesCache === null) recipesCache = readFromDisk<Recipe[]>(RECIPES_KEY, []);
    return recipesCache;
  }
  export function saveCachedRecipes(recipes: Recipe[]): void {
    recipesCache = recipes;
    scheduleWrite(RECIPES_KEY, recipes);
  }
  ```
  →
  ```ts
  export function loadCachedTransactions(): Transaction[] {
    if (transactionsCache === null) transactionsCache = readFromDisk<Transaction[]>(TRANSACTIONS_KEY, []);
    return transactionsCache;
  }
  export function saveCachedTransactions(transactions: Transaction[]): void {
    transactionsCache = transactions;
    scheduleWrite(TRANSACTIONS_KEY, transactions);
  }
  ```
- In `clearCache`, change
  ```ts
  recipesCache = [];
  queueCache = [];
  localStorage.removeItem(RECIPES_KEY);
  ```
  to
  ```ts
  transactionsCache = [];
  queueCache = [];
  localStorage.removeItem(TRANSACTIONS_KEY);
  ```
  (the `QUEUE_KEY` removal line stays as-is).

- [ ] **Step 3: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd $ROOT && git add src/offline/localCache.ts && git commit -m "feat: port offline cache for transactions"
```

---

## Task 9: sheetApi for transactions

**Files:**
- Create: `src/api/sheetApi.ts`

**Interfaces:**
- Consumes: `getStoredApiUrl` (apiUrl), `getStoredLocale`, `translate`, `Transaction`, `TransactionFormData`, `ApiEnvelope`.
- Produces: `fetchTransactions()`, `addTransaction(form)`, `updateTransaction(partialWithId)`, `deleteTransaction(id)`, `verifyApiUrl(url)`.
- Consumed by: Task 10 (store), Task 14 (LoginScreen).

- [ ] **Step 1: Create `src/api/sheetApi.ts`**

```ts
// Thin, typed fetch wrapper around the Apps Script API — browser fetch only,
// no HTTP client dependency. The Web App URL is whatever the user connected on
// the login screen (localStorage, see config/apiUrl.ts); each call reads it
// fresh so switching sheets takes effect immediately. This module sits outside
// the React tree, so it reads the current language via getStoredLocale()
// rather than the useI18n() hook.

import { getStoredApiUrl } from '../config/apiUrl';
import { getStoredLocale } from '../i18n/locale';
import { translate } from '../i18n/translate';
import type { ApiEnvelope, Transaction, TransactionFormData } from '../types';

function requireApiUrl(): string {
  const url = getStoredApiUrl();
  if (!url) throw new Error(translate(getStoredLocale(), 'errNotConnected'));
  return url;
}

/**
 * Coerce every field to the type our model promises. Google Sheets types cells
 * by content, so `amount` comes back as a JS number (good) but a note typed as
 * "123" could arrive as a number too. We force text fields to strings, force
 * `amount` through Number() with a NaN guard, and clamp `type` to a known value
 * so a malformed cell can never crash the list or summary.
 */
function normalizeTransaction(raw: Transaction): Transaction {
  const str = (v: unknown): string => (v == null ? '' : String(v));
  const amount = Number(raw.amount);
  return {
    id: str(raw.id),
    type: raw.type === 'income' ? 'income' : 'expense',
    amount: Number.isFinite(amount) ? amount : 0,
    category: str(raw.category),
    date: str(raw.date).slice(0, 10),
    note: raw.note == null ? '' : str(raw.note),
    createdAt: str(raw.createdAt)
  };
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const apiUrl = requireApiUrl();
  const res = await fetch(`${apiUrl}?action=list`);
  const json = (await res.json()) as ApiEnvelope<Transaction[]>;
  if (!json.success || !json.data) {
    throw new Error(json.error ?? translate(getStoredLocale(), 'errFetchFailed'));
  }
  return json.data.map(normalizeTransaction);
}

export async function addTransaction(form: TransactionFormData): Promise<Transaction> {
  return normalizeTransaction(await postAction<Transaction>('add', form));
}

export async function updateTransaction(
  data: Partial<TransactionFormData> & { id: string }
): Promise<Transaction> {
  return normalizeTransaction(await postAction<Transaction>('update', data));
}

export async function deleteTransaction(id: string): Promise<void> {
  await postAction<null>('delete', { id });
}

async function postAction<T>(
  action: 'add' | 'update' | 'delete',
  data: unknown
): Promise<T> {
  const apiUrl = requireApiUrl();
  // text/plain avoids a CORS preflight (OPTIONS), which Apps Script Web Apps
  // don't handle well. The body is still JSON text underneath.
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data })
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!json.success) {
    throw new Error(json.error ?? translate(getStoredLocale(), 'errActionFailed', { action }));
  }
  return json.data as T;
}

/** Used by the login screen: confirms a URL is a working deployment for this app. */
export async function verifyApiUrl(url: string): Promise<void> {
  const locale = getStoredLocale();
  let res: Response;
  try {
    res = await fetch(`${url}?action=list`);
  } catch {
    throw new Error(translate(locale, 'errVerifyNetwork'));
  }
  if (!res.ok) throw new Error(translate(locale, 'errVerifyStatus', { status: res.status }));
  const json = (await res.json()) as ApiEnvelope<Transaction[]>;
  if (!json.success) throw new Error(json.error ?? translate(locale, 'errVerifyInvalid'));
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd $ROOT && git add src/api/sheetApi.ts && git commit -m "feat: add transaction sheet API"
```

---

## Task 10: useTransactionStore (offline-first sync)

**Files:**
- Create: `src/hooks/useTransactionStore.ts`

**Interfaces:**
- Consumes: `sheetApi.*`, `localCache.*`, `useOnlineStatus`, `Transaction`, `TransactionFormData`, `QueueEntry`.
- Produces: `useTransactionStore(): TransactionStore` with:
  ```ts
  interface TransactionStore {
    transactions: Transaction[];
    loading: boolean;
    error: string | null;
    isOnline: boolean;
    syncing: boolean;
    pendingCount: number;
    addTransaction: (form: TransactionFormData) => Promise<Transaction>;
    updateTransaction: (id: string, form: Partial<TransactionFormData>) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
    syncNow: () => Promise<void>;
    refresh: () => Promise<void>;
    clearError: () => void;
  }
  ```
- Consumed by: Task 13 (AppShell).

This is a direct port of `$RECIPE/src/hooks/useRecipeStore.ts` with the recipe-only features removed (`setRecipePublic`, `importRecipes`, `isPublic` handling). The queue/optimistic logic is unchanged.

- [ ] **Step 1: Create `src/hooks/useTransactionStore.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import * as sheetApi from '../api/sheetApi';
import {
  isLocalId,
  loadCachedTransactions,
  loadQueue,
  makeLocalId,
  saveCachedTransactions,
  saveQueue
} from '../offline/localCache';
import useOnlineStatus from './useOnlineStatus';
import type { QueueEntry, Transaction, TransactionFormData } from '../types';

export interface TransactionStore {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  syncing: boolean;
  pendingCount: number;
  addTransaction: (form: TransactionFormData) => Promise<Transaction>;
  updateTransaction: (id: string, form: Partial<TransactionFormData>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

/**
 * Offline-first strategy (ported from recipe-app):
 * 1. First render reads transactions straight from localStorage (instant, no
 *    network).
 * 2. When online, refresh from the sheet in the background and merge — any
 *    change still in the sync queue takes precedence so it is never overwritten.
 * 3. add/update/delete apply to state and cache immediately (optimistic), then
 *    push to the sheet; on failure they stay queued and retry on reconnect.
 */
export default function useTransactionStore(): TransactionStore {
  const isOnline = useOnlineStatus();
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadCachedTransactions());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length);

  const syncLockRef = useRef(false);
  const txnsRef = useRef(transactions);
  txnsRef.current = transactions;

  const persist = useCallback((next: Transaction[]) => {
    setTransactions(next);
    saveCachedTransactions(next);
  }, []);

  const enqueue = useCallback((entry: QueueEntry) => {
    const queue = [...loadQueue(), entry];
    saveQueue(queue);
    setPendingCount(queue.length);
  }, []);

  const refreshFromRemote = useCallback(async () => {
    const remote = await sheetApi.fetchTransactions();
    const queue = loadQueue();
    const byId = new Map(remote.map((t) => [t.id, t]));

    for (const entry of queue) {
      if (entry.type === 'add' && entry.payload) {
        byId.set(entry.id, {
          ...(entry.payload as TransactionFormData),
          id: entry.id,
          createdAt: new Date().toISOString(),
          _pending: true
        });
      } else if (entry.type === 'update' && entry.payload) {
        const existing = byId.get(entry.id);
        if (existing) byId.set(entry.id, { ...existing, ...entry.payload, _pending: true });
      } else if (entry.type === 'delete') {
        byId.delete(entry.id);
      }
    }
    persist(Array.from(byId.values()));
  }, [persist]);

  const remapLocalId = useCallback(
    (oldId: string, created: Transaction) => {
      const next = txnsRef.current.map((t) => (t.id === oldId ? created : t));
      persist(next);
      const queue = loadQueue().map((entry) => (entry.id === oldId ? { ...entry, id: created.id } : entry));
      saveQueue(queue);
    },
    [persist]
  );

  const clearPendingFlag = useCallback(
    (id: string) => {
      persist(txnsRef.current.map((t) => (t.id === id ? { ...t, _pending: false } : t)));
    },
    [persist]
  );

  const syncQueue = useCallback(async () => {
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setSyncing(true);
    try {
      let queue = loadQueue();
      while (queue.length > 0) {
        const entry = queue[0];
        try {
          if (entry.type === 'add' && entry.payload) {
            const created = await sheetApi.addTransaction(entry.payload as TransactionFormData);
            remapLocalId(entry.id, created);
          } else if (entry.type === 'update' && entry.payload) {
            await sheetApi.updateTransaction({ id: entry.id, ...entry.payload });
            clearPendingFlag(entry.id);
          } else if (entry.type === 'delete') {
            if (!isLocalId(entry.id)) await sheetApi.deleteTransaction(entry.id);
          }
          queue = queue.slice(1);
          saveQueue(queue);
          setPendingCount(queue.length);
        } catch {
          break; // still offline / server error — retry later
        }
      }
    } finally {
      setSyncing(false);
      syncLockRef.current = false;
    }
  }, [remapLocalId, clearPendingFlag]);

  useEffect(() => {
    setLoading(false);
    if (navigator.onLine) refreshFromRemote().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOnline) syncQueue().catch(() => {});
  }, [isOnline, syncQueue]);

  const addTransaction = useCallback(
    async (form: TransactionFormData): Promise<Transaction> => {
      const tempId = makeLocalId();
      const optimistic: Transaction = {
        ...form,
        id: tempId,
        createdAt: new Date().toISOString(),
        _pending: true
      };
      persist([...txnsRef.current, optimistic]);
      enqueue({ type: 'add', id: tempId, payload: form });
      if (navigator.onLine) syncQueue().catch(() => {});
      return optimistic;
    },
    [persist, enqueue, syncQueue]
  );

  const updateTransaction = useCallback(
    async (id: string, form: Partial<TransactionFormData>): Promise<void> => {
      persist(txnsRef.current.map((t) => (t.id === id ? { ...t, ...form, _pending: true } : t)));

      const queue = loadQueue();
      const pendingAddIndex = queue.findIndex((e) => e.type === 'add' && e.id === id);
      if (pendingAddIndex !== -1) {
        queue[pendingAddIndex] = {
          ...queue[pendingAddIndex],
          payload: { ...queue[pendingAddIndex].payload, ...form }
        };
        saveQueue(queue);
        setPendingCount(queue.length);
      } else {
        enqueue({ type: 'update', id, payload: form });
      }
      if (navigator.onLine) syncQueue().catch(() => {});
    },
    [persist, enqueue, syncQueue]
  );

  const deleteTransaction = useCallback(
    async (id: string): Promise<void> => {
      persist(txnsRef.current.filter((t) => t.id !== id));
      const queue = loadQueue();
      const wasUnsyncedAdd = queue.some((e) => e.type === 'add' && e.id === id);
      const filtered = queue.filter((e) => e.id !== id);
      if (!wasUnsyncedAdd) filtered.push({ type: 'delete', id, payload: null });
      saveQueue(filtered);
      setPendingCount(filtered.length);
      if (navigator.onLine) syncQueue().catch(() => {});
    },
    [persist, syncQueue]
  );

  const syncAndRefresh = useCallback(async () => {
    await syncQueue();
    if (!navigator.onLine) return;
    try {
      await refreshFromRemote();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [syncQueue, refreshFromRemote]);

  const clearError = useCallback(() => setError(null), []);

  return {
    transactions,
    loading,
    error,
    isOnline,
    syncing,
    pendingCount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    syncNow: syncAndRefresh,
    refresh: refreshFromRemote,
    clearError
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd $ROOT && git add src/hooks/useTransactionStore.ts && git commit -m "feat: add offline-first transaction store"
```

---

## Task 11: Port Toast, LanguageSwitch, SyncStatus, InstallPrompt, PullToRefreshIndicator

**Files:**
- Create (copy): `src/components/Toast.tsx`, `src/components/LanguageSwitch.tsx`, `src/components/SyncStatus.tsx`, `src/components/InstallPrompt.tsx`, `src/components/PullToRefreshIndicator.tsx`

**Interfaces:**
- Produces: `ToastProvider`, `useToast`; `LanguageSwitch`; `SyncStatus`; `InstallPrompt`; `PullToRefreshIndicator`.
- Consumed by: Tasks 12–14.

- [ ] **Step 1: Copy the five components**

```bash
cp $RECIPE/src/components/Toast.tsx                  $ROOT/src/components/Toast.tsx
cp $RECIPE/src/components/LanguageSwitch.tsx         $ROOT/src/components/LanguageSwitch.tsx
cp $RECIPE/src/components/SyncStatus.tsx             $ROOT/src/components/SyncStatus.tsx
cp $RECIPE/src/components/InstallPrompt.tsx          $ROOT/src/components/InstallPrompt.tsx
cp $RECIPE/src/components/PullToRefreshIndicator.tsx $ROOT/src/components/PullToRefreshIndicator.tsx
```

- [ ] **Step 2: Reconcile translation keys**

Open each copied file and confirm every `t('...')` key exists in `src/i18n/translations.ts` (Task 7). `SyncStatus` uses `syncOnline`, `syncOffline`, `syncPendingChanges`, `syncNowBtn`, `syncSyncing` — all present. `Toast` uses `dismissNotification` — present. `InstallPrompt` uses `installPromptText`, `installBtn`, `installDismiss` — present. If `LanguageSwitch` or `InstallPrompt` reference any key not in translations.ts, add that key to both `en` and `id` (matching the existing style) rather than editing the component. If `InstallPrompt` imports `useInstallPrompt`, it resolves (Task 6).

- [ ] **Step 3: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS. If it fails on a missing translation key, add the key to `translations.ts` (both locales) and re-run.

- [ ] **Step 4: Commit**

```bash
cd $ROOT && git add src/components/ && git commit -m "chore: port toast, language switch, sync status, install prompt"
```

---

## Task 12: Summary + SpendingHeatmap components

**Files:**
- Create: `src/components/Summary.tsx`, `src/components/SpendingHeatmap.tsx`

**Interfaces:**
- Consumes: `computeBalance`, `computeMonthTotals` (Task 4); `buildHeatmap`, `HeatCell` (Task 5); `formatIDR` (Task 2); `Transaction`.
- Produces:
  - `Summary({ transactions, todayISO }: { transactions: Transaction[]; todayISO: string })`.
  - `SpendingHeatmap({ transactions, todayISO, selectedDate, onSelectDate }: { transactions: Transaction[]; todayISO: string; selectedDate: string | null; onSelectDate: (date: string | null) => void })`.
- Consumed by: Task 13 (AppShell).

- [ ] **Step 1: Create `src/components/Summary.tsx`**

```tsx
import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { computeBalance, computeMonthTotals } from '../utils/summary';
import { formatIDR } from '../utils/money';
import type { Transaction } from '../types';

interface SummaryProps {
  transactions: Transaction[];
  todayISO: string;
}

function Summary({ transactions, todayISO }: SummaryProps) {
  const { t } = useI18n();
  const balance = computeBalance(transactions);
  const { income, expense } = computeMonthTotals(transactions, todayISO);

  return (
    <section className="summary" aria-label={t('balanceLabel')}>
      <div className="summary__balance">
        <span className="summary__label">{t('balanceLabel')}</span>
        <span className="summary__amount">{formatIDR(balance)}</span>
      </div>
      <div className="summary__months">
        <div className="summary__stat summary__stat--income">
          <span className="summary__stat-label">{t('monthIncomeLabel')}</span>
          <span className="summary__stat-value">↑ {formatIDR(income)}</span>
        </div>
        <div className="summary__stat summary__stat--expense">
          <span className="summary__stat-label">{t('monthExpenseLabel')}</span>
          <span className="summary__stat-value">↓ {formatIDR(expense)}</span>
        </div>
      </div>
    </section>
  );
}

export default memo(Summary);
```

- [ ] **Step 2: Create `src/components/SpendingHeatmap.tsx`**

```tsx
import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { buildHeatmap } from '../utils/heatmap';
import { formatIDR } from '../utils/money';
import type { Transaction } from '../types';

const WEEKS = 26;

interface SpendingHeatmapProps {
  transactions: Transaction[];
  todayISO: string;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

function SpendingHeatmap({ transactions, todayISO, selectedDate, onSelectDate }: SpendingHeatmapProps) {
  const { t } = useI18n();
  const grid = useMemo(() => buildHeatmap(transactions, WEEKS, todayISO), [transactions, todayISO]);

  return (
    <section className="heatmap" aria-label={t('heatmapTitle')}>
      <div className="heatmap__head">
        <span className="heatmap__title">{t('heatmapTitle')}</span>
        {selectedDate && (
          <button type="button" className="heatmap__clear" onClick={() => onSelectDate(null)}>
            {t('heatmapClearFilter')}
          </button>
        )}
      </div>
      <div className="heatmap__scroll">
        <div className="heatmap__grid">
          {grid.map((col, ci) => (
            <div className="heatmap__col" key={ci}>
              {col.map((cell, ri) => {
                if (!cell.date) return <span key={ri} className="heat-cell heat-cell--pad" />;
                const isSelected = cell.date === selectedDate;
                return (
                  <button
                    key={ri}
                    type="button"
                    className={`heat-cell heat-cell--l${cell.level} ${isSelected ? 'heat-cell--selected' : ''}`}
                    title={t('heatmapDayTotal', { date: cell.date, amount: formatIDR(cell.total) })}
                    aria-label={t('heatmapDayTotal', { date: cell.date, amount: formatIDR(cell.total) })}
                    aria-pressed={isSelected}
                    onClick={() => onSelectDate(isSelected ? null : cell.date)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap__legend">
        <span>{t('heatmapLess')}</span>
        <span className="heat-cell heat-cell--l0" />
        <span className="heat-cell heat-cell--l1" />
        <span className="heat-cell heat-cell--l2" />
        <span className="heat-cell heat-cell--l3" />
        <span className="heat-cell heat-cell--l4" />
        <span>{t('heatmapMore')}</span>
      </div>
    </section>
  );
}

export default memo(SpendingHeatmap);
```

- [ ] **Step 3: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd $ROOT && git add src/components/Summary.tsx src/components/SpendingHeatmap.tsx && git commit -m "feat: add summary and spending heatmap components"
```

---

## Task 13: TransactionCard + TransactionList

**Files:**
- Create: `src/components/TransactionCard.tsx`, `src/components/TransactionList.tsx`

**Interfaces:**
- Consumes: `groupByDate`, `relativeDay` (Task 4); `formatIDR` (Task 2); `Transaction`.
- Produces:
  - `TransactionCard({ transaction, onEdit }: { transaction: Transaction; onEdit: (t: Transaction) => void })`.
  - `TransactionList({ transactions, todayISO, selectedDate, onEdit }: { transactions: Transaction[]; todayISO: string; selectedDate: string | null; onEdit: (t: Transaction) => void })`.
- Consumed by: Task 14 (AppShell).

- [ ] **Step 1: Create `src/components/TransactionCard.tsx`**

```tsx
import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import type { Transaction } from '../types';

interface TransactionCardProps {
  transaction: Transaction;
  onEdit: (t: Transaction) => void;
}

function TransactionCard({ transaction, onEdit }: TransactionCardProps) {
  const { t } = useI18n();
  const { type, amount, category, note, _pending } = transaction;
  const sign = type === 'income' ? '+' : '−';

  return (
    <button type="button" className="txn-card" onClick={() => onEdit(transaction)}>
      <span className="txn-card__main">
        <span className="txn-card__category">{category || '—'}</span>
        {note ? <span className="txn-card__note">{note}</span> : null}
        {_pending ? <span className="txn-card__pending">{t('pendingTag')}</span> : null}
      </span>
      <span className={`txn-card__amount txn-card__amount--${type}`}>
        {sign} {formatIDR(amount)}
      </span>
    </button>
  );
}

export default memo(TransactionCard);
```

- [ ] **Step 2: Create `src/components/TransactionList.tsx`**

```tsx
import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { groupByDate, relativeDay } from '../utils/dateGroups';
import TransactionCard from './TransactionCard';
import type { Transaction } from '../types';

interface TransactionListProps {
  transactions: Transaction[];
  todayISO: string;
  selectedDate: string | null;
  onEdit: (t: Transaction) => void;
}

function TransactionList({ transactions, todayISO, selectedDate, onEdit }: TransactionListProps) {
  const { t } = useI18n();

  const visible = useMemo(
    () => (selectedDate ? transactions.filter((x) => x.date === selectedDate) : transactions),
    [transactions, selectedDate]
  );
  const groups = useMemo(() => groupByDate(visible), [visible]);

  if (groups.length === 0) {
    return (
      <p className="txn-list__empty">
        {selectedDate ? t('emptyDayFiltered') : t('emptyTransactions')}
      </p>
    );
  }

  function labelFor(date: string): string {
    const rel = relativeDay(date, todayISO);
    if (rel === 'today') return t('relativeToday');
    if (rel === 'yesterday') return t('relativeYesterday');
    return date;
  }

  return (
    <div className="txn-list">
      {groups.map((group) => (
        <section className="txn-group" key={group.date}>
          <h2 className="txn-group__heading">{labelFor(group.date)}</h2>
          {group.items.map((txn) => (
            <TransactionCard key={txn.id} transaction={txn} onEdit={onEdit} />
          ))}
        </section>
      ))}
    </div>
  );
}

export default memo(TransactionList);
```

- [ ] **Step 3: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd $ROOT && git add src/components/TransactionCard.tsx src/components/TransactionList.tsx && git commit -m "feat: add transaction card and grouped list"
```

---

## Task 14: TransactionForm

**Files:**
- Create: `src/components/TransactionForm.tsx`

**Interfaces:**
- Consumes: `categoriesFor` (Task 3); `parseAmount`, `formatIDR` (Task 2); `useI18n`; `TransactionFormData`, `TransactionType`, `Transaction`.
- Produces: `TransactionForm({ onSubmit, submitting, initialValue, onCancel, onDelete }: TransactionFormProps)`.
  ```ts
  interface TransactionFormProps {
    onSubmit: (form: TransactionFormData) => Promise<void> | void;
    submitting: boolean;
    initialValue?: TransactionFormData; // present => edit mode
    onCancel: () => void;
    onDelete?: () => void; // present only in edit mode
  }
  ```
- Consumed by: Task 15 (AppShell).

- [ ] **Step 1: Create `src/components/TransactionForm.tsx`**

```tsx
import { memo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/context';
import { categoriesFor } from '../config/categories';
import { parseAmount, formatIDR } from '../utils/money';
import type { Transaction, TransactionFormData, TransactionType } from '../types';

interface TransactionFormProps {
  onSubmit: (form: TransactionFormData) => Promise<void> | void;
  submitting: boolean;
  /** Existing values when editing. Parent keys the component by txn id to remount. */
  initialValue?: TransactionFormData;
  onCancel: () => void;
  onDelete?: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY: TransactionFormData = {
  type: 'expense',
  amount: 0,
  category: '',
  date: todayISO(),
  note: ''
};

function TransactionForm({ onSubmit, submitting, initialValue, onCancel, onDelete }: TransactionFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;
  const seed = initialValue ?? EMPTY;

  const [type, setType] = useState<TransactionType>(seed.type);
  // Amount is held as display text so grouping shows while typing; the stored
  // integer is derived via parseAmount on submit.
  const [amountText, setAmountText] = useState<string>(seed.amount ? formatIDR(seed.amount).replace('Rp ', '') : '');
  const [category, setCategory] = useState(seed.category);
  const [date, setDate] = useState(seed.date);
  const [note, setNote] = useState(seed.note ?? '');

  function handleAmountChange(raw: string) {
    const parsed = parseAmount(raw);
    setAmountText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(amountText);
    if (amount <= 0) return;
    await onSubmit({ type, amount, category: category.trim(), date, note: note.trim() });
  }

  const listId = `categories-${type}`;

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <div className="type-switch" role="group" aria-label={t('fieldAmount')}>
        <button
          type="button"
          className={`type-switch__btn ${type === 'expense' ? 'active' : ''}`}
          aria-pressed={type === 'expense'}
          onClick={() => setType('expense')}
        >
          {t('typeExpense')}
        </button>
        <button
          type="button"
          className={`type-switch__btn ${type === 'income' ? 'active' : ''}`}
          aria-pressed={type === 'income'}
          onClick={() => setType('income')}
        >
          {t('typeIncome')}
        </button>
      </div>

      <label className="txn-form__amount">
        {t('fieldAmount')}
        <div className="amount-input">
          <span className="amount-input__prefix">Rp</span>
          <input
            inputMode="numeric"
            value={amountText}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={t('amountPlaceholder')}
            autoFocus={!isEditing}
            required
          />
        </div>
      </label>

      <label>
        {t('fieldCategory')}
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list={listId}
          placeholder={t('categoryPlaceholder')}
        />
        <datalist id={listId}>
          {categoriesFor(type).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label>
        {t('fieldDate')}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <label>
        {t('fieldNote')}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
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

export default memo(TransactionForm);
```

- [ ] **Step 2: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd $ROOT && git add src/components/TransactionForm.tsx && git commit -m "feat: add transaction add/edit form"
```

---

## Task 15: AppShell (compose the screen)

**Files:**
- Create: `src/AppShell.tsx`

**Interfaces:**
- Consumes: `useTransactionStore`, `usePullToRefresh`, `PullToRefreshIndicator`, `SyncStatus`, `LanguageSwitch`, `Summary`, `SpendingHeatmap`, `TransactionList`, `TransactionForm`, `useToast`, `useI18n`, `Transaction`, `TransactionFormData`.
- Produces: `AppShell({ onChangeSheet }: { onChangeSheet: () => void })`.
- Consumed by: Task 16 (App).

- [ ] **Step 1: Create `src/AppShell.tsx`**

```tsx
import { lazy, Suspense, useCallback, useState } from 'react';
import useTransactionStore from './hooks/useTransactionStore';
import usePullToRefresh from './hooks/usePullToRefresh';
import PullToRefreshIndicator from './components/PullToRefreshIndicator';
import SyncStatus from './components/SyncStatus';
import LanguageSwitch from './components/LanguageSwitch';
import Summary from './components/Summary';
import SpendingHeatmap from './components/SpendingHeatmap';
import TransactionList from './components/TransactionList';
import { useToast } from './components/Toast';
import { useI18n } from './i18n/context';
import type { Transaction, TransactionFormData } from './types';

const TransactionForm = lazy(() => import('./components/TransactionForm'));

interface AppShellProps {
  onChangeSheet: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** null = list view; 'new' = adding; a Transaction = editing that row. */
type Editor = null | 'new' | Transaction;

export default function AppShell({ onChangeSheet }: AppShellProps) {
  const { t } = useI18n();
  const toast = useToast();
  const {
    transactions,
    error,
    isOnline,
    syncing,
    pendingCount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    syncNow,
    clearError
  } = useTransactionStore();

  const [editor, setEditor] = useState<Editor>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = todayISO();

  const pull = usePullToRefresh(syncNow);

  const handleSubmit = useCallback(
    async (form: TransactionFormData) => {
      setSubmitting(true);
      try {
        if (editor && editor !== 'new') await updateTransaction(editor.id, form);
        else await addTransaction(form);
        setEditor(null);
      } finally {
        setSubmitting(false);
      }
    },
    [editor, addTransaction, updateTransaction]
  );

  const handleDelete = useCallback(async () => {
    if (!editor || editor === 'new') return;
    if (!confirm(t('deleteTransactionConfirm'))) return;
    setSubmitting(true);
    try {
      await deleteTransaction(editor.id);
      setEditor(null);
    } finally {
      setSubmitting(false);
    }
  }, [editor, deleteTransaction, t]);

  if (error) {
    toast.show({ message: error, tone: 'error', sticky: true });
    clearError();
  }

  const initialValue: TransactionFormData | undefined =
    editor && editor !== 'new'
      ? { type: editor.type, amount: editor.amount, category: editor.category, date: editor.date, note: editor.note ?? '' }
      : undefined;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <h1 className="app__title">{t('appTitle')}</h1>
          <div className="app__header-controls">
            <LanguageSwitch />
            <button type="button" className="app__change-sheet" onClick={onChangeSheet} aria-label={t('changeSheetLabel')}>
              ⋯
            </button>
          </div>
        </div>
        <SyncStatus isOnline={isOnline} syncing={syncing} pendingCount={pendingCount} onSyncNow={syncNow} />
      </header>

      <main className="app__main" {...pull.bind}>
        <PullToRefreshIndicator pull={pull} />
        <Summary transactions={transactions} todayISO={today} />
        <SpendingHeatmap
          transactions={transactions}
          todayISO={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
        <TransactionList
          transactions={transactions}
          todayISO={today}
          selectedDate={selectedDate}
          onEdit={(txn) => setEditor(txn)}
        />
      </main>

      <button type="button" className="fab" aria-label={t('addFabLabel')} onClick={() => setEditor('new')}>
        +
      </button>

      {editor !== null && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={editor === 'new' ? t('addTitle') : t('editTitle')}>
          <div className="modal__backdrop" onClick={() => !submitting && setEditor(null)} />
          <div className="modal__panel">
            <h2 className="modal__title">{editor === 'new' ? t('addTitle') : t('editTitle')}</h2>
            <Suspense fallback={<p className="modal__loading">{t('loadingForm')}</p>}>
              <TransactionForm
                key={editor === 'new' ? 'new' : editor.id}
                onSubmit={handleSubmit}
                submitting={submitting}
                initialValue={initialValue}
                onCancel={() => setEditor(null)}
                onDelete={editor !== 'new' ? handleDelete : undefined}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reconcile `usePullToRefresh` / `PullToRefreshIndicator` interface**

Open `$ROOT/src/hooks/usePullToRefresh.ts` and `$ROOT/src/components/PullToRefreshIndicator.tsx` (ported in Tasks 6/11) and confirm the actual returned shape. The recipe-app hook returns an object used to bind handlers to the scroll container and drive the indicator. If its property names differ from `pull.bind` / `<PullToRefreshIndicator pull={pull} />` used above, adjust these two lines in `AppShell.tsx` to match the real API (do not change the hook/indicator). Re-run typecheck after adjusting.

- [ ] **Step 3: Verify typecheck**

Run: `cd $ROOT && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd $ROOT && git add src/AppShell.tsx && git commit -m "feat: compose app shell (summary, heatmap, list, fab, add/edit modal)"
```

---

## Task 16: App + main + LoginScreen (login gate + providers)

**Files:**
- Create: `src/components/LoginScreen.tsx` (copy + edit), `src/App.tsx` (replace placeholder), `src/main.tsx` (replace)

**Interfaces:**
- Consumes: `getStoredApiUrl`, `clearStoredApiUrl`, `setStoredApiUrl`, `isValidAppsScriptUrl`, `verifyApiUrl`, `clearCache`, `useI18n`, `AppShell`.
- Produces: the running app with a Sheet-connection gate.

- [ ] **Step 1: Copy and adapt `LoginScreen.tsx`**

```bash
cp $RECIPE/src/components/LoginScreen.tsx $ROOT/src/components/LoginScreen.tsx
```
Then edit `$ROOT/src/components/LoginScreen.tsx` so the help block uses this project's keys. Replace the `<details className="login-card__help">...</details>` block with:
```tsx
        <details className="login-card__help">
          <summary>{t('helpSummary')}</summary>
          <ol>
            <li>{t('helpStep1')}</li>
            <li>{t('helpStep2')}</li>
            <li>{t('helpStep3')}</li>
            <li>{t('helpStep4')}</li>
          </ol>
        </details>
```
All other keys it uses (`appTitle`, `loginTagline`, `webAppUrlLabel`, `connectBtn`, `connecting`, `invalidUrlError`) exist in `translations.ts`. Confirm the tagline key is `loginTagline` (it is).

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { clearStoredApiUrl, getStoredApiUrl } from './config/apiUrl';
import { clearCache } from './offline/localCache';
import { useI18n } from './i18n/context';
import LoginScreen from './components/LoginScreen';
import InstallPrompt from './components/InstallPrompt';
import AppShell from './AppShell';

/**
 * Top-level gate: shows the login screen until the user has connected a Google
 * Sheet (a working Apps Script Web App URL), then renders the app. key={apiUrl}
 * forces a full remount when the connected sheet changes, so the store starts
 * fresh against the new sheet.
 */
export default function App() {
  const { t } = useI18n();
  const [apiUrl, setApiUrl] = useState<string | null>(() => getStoredApiUrl());

  const handleConnected = useCallback((url: string) => setApiUrl(url), []);

  const handleChangeSheet = useCallback(() => {
    if (!confirm(t('changeSheetConfirm'))) return;
    clearStoredApiUrl();
    clearCache();
    setApiUrl(null);
  }, [t]);

  return (
    <>
      <InstallPrompt />
      {apiUrl ? (
        <AppShell key={apiUrl} onChangeSheet={handleChangeSheet} />
      ) : (
        <LoginScreen onConnected={handleConnected} />
      )}
    </>
  );
}
```

- [ ] **Step 3: Replace `src/main.tsx` with the provider-wrapped version**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n/context';
import { ToastProvider } from './components/Toast';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

- [ ] **Step 4: Verify build**

Run: `cd $ROOT && pnpm typecheck && pnpm build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
cd $ROOT && git add src/App.tsx src/main.tsx src/components/LoginScreen.tsx && git commit -m "feat: wire login gate, providers, and service worker"
```

---

## Task 17: Styling (responsive, FAB, heatmap, modal)

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: the class names used across Tasks 11–16 (`.app`, `.app__header*`, `.summary*`, `.heatmap*`, `.heat-cell*`, `.txn-*`, `.fab`, `.modal*`, `.type-switch*`, `.amount-input*`, `.btn*`, `.login-*`, `.sync-*`, `.toast*`).

- [ ] **Step 1: Write `src/index.css`**

Replace the placeholder file with the full stylesheet below. It is mobile-first with `640px`/`1024px` breakpoints, a theme-aware sequential heatmap scale, a FAB, and a centered-dialog modal on desktop / full-screen on mobile.

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #ffffff;
  --text: #111111;
  --muted: #6b7280;
  --line: #ececec;
  --accent: #111111;
  --income: #157f3b;
  --expense: #b23b3b;
  --heat-0: #eef0f1;
  --heat-1: #cfe6d6;
  --heat-2: #94cfa8;
  --heat-3: #4fa971;
  --heat-4: #1f7a44;
  --radius: 12px;
  --max: 720px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1113; --surface: #16191c; --text: #f3f4f6; --muted: #9aa1a8;
    --line: #23272b; --accent: #f3f4f6; --income: #4ccf7f; --expense: #e57373;
    --heat-0: #23272b; --heat-1: #1e3a2a; --heat-2: #2f6d47; --heat-3: #3fa066; --heat-4: #57cf86;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; cursor: pointer; }

.app { min-height: 100dvh; }
.app__header {
  position: sticky; top: 0; z-index: 10; background: var(--bg);
  padding: 1rem 1rem 0.5rem; border-bottom: 1px solid var(--line);
}
.app__header-row { display: flex; align-items: center; justify-content: space-between; }
.app__title { margin: 0; font-size: 1.25rem; }
.app__header-controls { display: flex; align-items: center; gap: 0.5rem; }
.app__change-sheet {
  border: none; background: transparent; color: var(--muted);
  font-size: 1.5rem; line-height: 1; padding: 0.25rem 0.5rem;
}
.app__main {
  max-width: var(--max); margin: 0 auto; padding: 1rem 1rem 6rem;
  display: flex; flex-direction: column; gap: 1.25rem;
}

/* Summary */
.summary { display: flex; flex-direction: column; gap: 0.75rem; }
.summary__label, .summary__stat-label { color: var(--muted); font-size: 0.8rem; }
.summary__balance { display: flex; flex-direction: column; gap: 0.15rem; }
.summary__amount { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
.summary__months { display: flex; gap: 1.5rem; }
.summary__stat { display: flex; flex-direction: column; gap: 0.15rem; }
.summary__stat-value { font-weight: 600; }
.summary__stat--income .summary__stat-value { color: var(--income); }
.summary__stat--expense .summary__stat-value { color: var(--expense); }

/* Heatmap */
.heatmap { display: flex; flex-direction: column; gap: 0.5rem; }
.heatmap__head { display: flex; align-items: center; justify-content: space-between; }
.heatmap__title { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
.heatmap__clear { border: 1px solid var(--line); background: var(--surface); color: var(--text); border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.75rem; }
.heatmap__scroll { overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch; }
.heatmap__grid { display: inline-flex; gap: 3px; padding-bottom: 2px; }
.heatmap__col { display: flex; flex-direction: column; gap: 3px; }
.heat-cell { width: 12px; height: 12px; border-radius: 3px; border: none; padding: 0; background: var(--heat-0); }
.heat-cell--pad { background: transparent; }
.heat-cell--l0 { background: var(--heat-0); }
.heat-cell--l1 { background: var(--heat-1); }
.heat-cell--l2 { background: var(--heat-2); }
.heat-cell--l3 { background: var(--heat-3); }
.heat-cell--l4 { background: var(--heat-4); }
.heat-cell--selected { outline: 2px solid var(--accent); outline-offset: 1px; }
.heatmap__legend { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 0.7rem; }

/* Transaction list */
.txn-list { display: flex; flex-direction: column; gap: 1.25rem; }
.txn-list__empty { color: var(--muted); text-align: center; padding: 2rem 1rem; }
.txn-group { display: flex; flex-direction: column; gap: 0.25rem; }
.txn-group__heading { margin: 0 0 0.25rem; font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.txn-card {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  width: 100%; text-align: left; background: transparent; border: none;
  padding: 0.7rem 0; border-bottom: 1px solid var(--line); min-height: 48px;
}
.txn-card__main { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.txn-card__category { font-weight: 600; }
.txn-card__note { color: var(--muted); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.txn-card__pending { color: var(--muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
.txn-card__amount { font-weight: 600; white-space: nowrap; }
.txn-card__amount--income { color: var(--income); }
.txn-card__amount--expense { color: var(--expense); }

/* FAB */
.fab {
  position: fixed; right: max(1rem, env(safe-area-inset-right)); bottom: max(1.25rem, env(safe-area-inset-bottom));
  width: 56px; height: 56px; border-radius: 50%; border: none;
  background: var(--accent); color: var(--bg); font-size: 1.8rem; line-height: 1;
  box-shadow: 0 6px 20px rgba(0,0,0,0.25); z-index: 20;
}
@media (min-width: 640px) {
  .fab { right: calc((100vw - var(--max)) / 2 + 1rem); }
}

/* Modal (full-screen mobile, centered dialog desktop) */
.modal { position: fixed; inset: 0; z-index: 30; display: flex; }
.modal__backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.4); }
.modal__panel {
  position: relative; margin-top: auto; width: 100%; background: var(--surface);
  border-radius: var(--radius) var(--radius) 0 0; padding: 1.25rem;
  max-height: 92dvh; overflow-y: auto;
}
.modal__title { margin: 0 0 1rem; font-size: 1.1rem; }
.modal__loading { color: var(--muted); }
@media (min-width: 640px) {
  .modal { align-items: center; justify-content: center; }
  .modal__panel { margin: 0; max-width: 480px; border-radius: var(--radius); }
}

/* Form */
.txn-form { display: flex; flex-direction: column; gap: 1rem; }
.txn-form label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; color: var(--muted); }
.txn-form input {
  font-size: 1rem; color: var(--text); background: var(--bg);
  border: 1px solid var(--line); border-radius: 10px; padding: 0.7rem 0.75rem; min-height: 44px;
}
.type-switch, .amount-input { display: flex; }
.type-switch { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.type-switch__btn { flex: 1; border: none; background: var(--bg); color: var(--muted); padding: 0.6rem; min-height: 44px; }
.type-switch__btn.active { background: var(--accent); color: var(--bg); font-weight: 600; }
.amount-input { align-items: center; gap: 0.5rem; border: 1px solid var(--line); border-radius: 10px; padding: 0 0.75rem; }
.amount-input__prefix { color: var(--muted); }
.amount-input input { border: none; padding-left: 0; font-size: 1.4rem; font-weight: 600; flex: 1; }
.form-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.btn { border-radius: 10px; padding: 0.7rem 1.1rem; min-height: 44px; border: 1px solid var(--line); background: var(--bg); color: var(--text); }
.btn--primary { background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 600; }
.btn--secondary { background: var(--bg); }
.btn--danger { color: var(--expense); border-color: var(--expense); margin-left: auto; }
.btn:disabled { opacity: 0.5; }

/* Sync status */
.sync-status { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0; font-size: 0.8rem; color: var(--muted); }
.sync-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.sync-dot.is-online { background: var(--income); }
.sync-dot.is-offline { background: var(--muted); }
.sync-status__sep { opacity: 0.5; }
.sync-status__btn { border: 1px solid var(--line); background: var(--surface); color: var(--text); border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.75rem; }

/* Login */
.login-screen { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
.login-card { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 1rem; }
.login-card h1 { margin: 0; }
.login-card__tagline { color: var(--muted); margin: 0; }
.login-form { display: flex; flex-direction: column; gap: 0.75rem; }
.login-form label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; color: var(--muted); }
.login-form input { font-size: 1rem; border: 1px solid var(--line); border-radius: 10px; padding: 0.7rem; min-height: 44px; background: var(--bg); color: var(--text); }
.login-card__error { color: var(--expense); margin: 0; }
.login-card__help { color: var(--muted); font-size: 0.85rem; }
.lang-switch-row { display: flex; justify-content: flex-end; }

/* Toast (portalled to body) */
.toast-viewport { position: fixed; left: 50%; bottom: 1.25rem; transform: translateX(-50%); z-index: 40; display: flex; flex-direction: column; gap: 0.5rem; width: min(92vw, 420px); }
.toast { display: flex; align-items: center; gap: 0.6rem; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 0.7rem 0.9rem; box-shadow: 0 6px 20px rgba(0,0,0,0.2); opacity: 0; transform: translateY(8px); transition: opacity 0.2s, transform 0.2s; }
.toast--visible { opacity: 1; transform: translateY(0); }
.toast--error { border-color: var(--expense); }
.toast__text { margin: 0; flex: 1; font-size: 0.9rem; }
.toast__dismiss { border: none; background: transparent; color: var(--muted); }

@media (min-width: 1024px) {
  .summary__amount { font-size: 2.4rem; }
  .heat-cell { width: 14px; height: 14px; }
}
```

- [ ] **Step 2: Reconcile any class-name mismatches from ported components**

Open the ported `SyncStatus.tsx`, `Toast.tsx`, `LanguageSwitch.tsx`, `InstallPrompt.tsx`, `PullToRefreshIndicator.tsx` and note the class names they actually use. The CSS above styles the SyncStatus/Toast/login classes; for `LanguageSwitch`, `InstallPrompt`, and `PullToRefreshIndicator`, add minimal rules for whatever class names those components emit (a few lines each) so they render sanely. Do not rename classes in the components.

- [ ] **Step 3: Verify build and smoke-test**

Run: `cd $ROOT && pnpm build && pnpm dev`
Open the dev URL. Expected: the login screen renders styled. (Full data flow needs a connected Sheet — Task 18.)

- [ ] **Step 4: Commit**

```bash
cd $ROOT && git add src/index.css && git commit -m "feat: responsive styling for shell, heatmap, list, form, fab, modal"
```

---

## Task 18: Google Apps Script backend (Code.gs)

**Files:**
- Create: `$ROOT/google-apps-script/Code.gs`

**Interfaces:**
- Produces the server the app talks to: `?action=list` (GET), and POST `add` / `update` / `delete` / `ping`, all returning `{ success, data?, error? }`.

- [ ] **Step 1: Create `$ROOT/google-apps-script/Code.gs`**

```javascript
/**
 * UANG — Personal Finance — Google Apps Script API
 * -------------------------------------------------
 * Paste into Extensions > Apps Script on your Google Sheet, then
 * Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 *
 * Sheet tab name: "Transactions". Columns (row 1 = header):
 *   id | type | amount | category | date | note | createdAt
 *
 * SECURITY: the Web App URL can add/edit/DELETE rows. If you will share the
 * URL, set a token: Project Settings > Script Properties > OWNER_TOKEN = <random>.
 * When set, every action requires that token; when unset the script is open
 * (fine for a URL only you hold).
 */

var SHEET_NAME = 'Transactions';
var HEADERS = ['id', 'type', 'amount', 'category', 'date', 'note', 'createdAt'];

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SHEET_NAME);
  sheet.appendRow(HEADERS);
  return sheet;
}

function ownerToken() {
  return PropertiesService.getScriptProperties().getProperty('OWNER_TOKEN') || '';
}
function isOwner(provided) {
  var expected = ownerToken();
  return expected === '' || provided === expected;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normType(v) { return String(v) === 'income' ? 'income' : 'expense'; }
function normAmount(v) { var n = Number(v); return isNaN(n) ? 0 : Math.round(n); }
function normDate(v) {
  if (v instanceof Date) {
    // Sheets may auto-parse a yyyy-mm-dd cell into a Date; render back to ISO date.
    var y = v.getFullYear(), m = ('0' + (v.getMonth() + 1)).slice(-2), d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return String(v).slice(0, 10);
}

function rowToObject(row) {
  return {
    id: String(row[0]),
    type: normType(row[1]),
    amount: normAmount(row[2]),
    category: String(row[3]),
    date: normDate(row[4]),
    note: String(row[5]),
    createdAt: String(row[6])
  };
}

function getAll(sheet) {
  var values = sheet.getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r[0] !== ''; }).map(rowToObject);
}

function findRowIndexById(sheet, id) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function addTransaction(sheet, data) {
  var id = Utilities.getUuid();
  var row = [
    id,
    normType(data.type),
    normAmount(data.amount),
    data.category || '',
    normDate(data.date || new Date()),
    data.note || '',
    new Date().toISOString()
  ];
  sheet.appendRow(row);
  return { success: true, data: rowToObject(row) };
}

function updateTransaction(sheet, data) {
  var rowIndex = findRowIndexById(sheet, data.id);
  if (rowIndex === -1) return { success: false, error: 'Transaction not found' };
  var existing = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  var updated = [
    existing[0],
    data.type != null ? normType(data.type) : existing[1],
    data.amount != null ? normAmount(data.amount) : existing[2],
    data.category != null ? data.category : existing[3],
    data.date != null ? normDate(data.date) : existing[4],
    data.note != null ? data.note : existing[5],
    existing[6]
  ];
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([updated]);
  return { success: true, data: rowToObject(updated) };
}

function deleteTransaction(sheet, id) {
  var rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) return { success: false, error: 'Transaction not found' };
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!isOwner(params.token)) return jsonResponse({ success: false, error: 'Unauthorized' });
    var sheet = getSheet();
    var action = params.action || 'list';
    if (action === 'list') return jsonResponse({ success: true, data: getAll(sheet) });
    return jsonResponse({ success: false, error: 'Unknown GET action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Script error: ' + (err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body;
    try { body = JSON.parse(e && e.postData ? e.postData.contents : ''); }
    catch (parseErr) { return jsonResponse({ success: false, error: 'Request body is not valid JSON' }); }
    if (!isOwner(body.token)) return jsonResponse({ success: false, error: 'Unauthorized' });
    var action = body.action;
    var data = body.data || {};
    if (action === 'ping') return jsonResponse({ success: true, data: null });
    var sheet = getSheet();
    if (action === 'add') return jsonResponse(addTransaction(sheet, data));
    if (action === 'update') return jsonResponse(updateTransaction(sheet, data));
    if (action === 'delete') return jsonResponse(deleteTransaction(sheet, data.id));
    return jsonResponse({ success: false, error: 'Unknown POST action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Script error: ' + (err && err.message ? err.message : err) });
  }
}
```

- [ ] **Step 2: Manual end-to-end smoke test (documented, run by the user)**

1. Create a Google Sheet, open Extensions → Apps Script, paste `Code.gs`, Deploy as Web app (Access: Anyone), copy the `/exec` URL.
2. `pnpm dev`, open the app, paste the URL on the login screen, Connect.
3. Add an expense and an income; confirm they appear grouped under "Today", the balance and month totals update, and a new row lands in the Sheet's "Transactions" tab.
4. Tap a heatmap square for today → list filters to today; "Show all days" clears it.
5. Toggle the browser offline, add a transaction → it shows with "Not synced"; go online → it syncs and the flag clears; confirm the row in the Sheet.

- [ ] **Step 3: Commit**

```bash
cd $ROOT && git add google-apps-script/Code.gs && git commit -m "feat: add Apps Script backend for transactions"
```

---

## Task 19: README + final verification

**Files:**
- Create: `$ROOT/README.md`

- [ ] **Step 1: Write `README.md`**

Cover: what the app is (one-paragraph), the "your data in a Sheet you own / offline-first" model, setup steps (create Sheet → paste `google-apps-script/Code.gs` → deploy → connect URL), and local dev (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`). Note the sheet columns (`id | type | amount | category | date | note | createdAt`) and the optional `OWNER_TOKEN`.

- [ ] **Step 2: Full verification**

Run:
```bash
cd $ROOT && pnpm install && pnpm typecheck && pnpm test && pnpm build
```
Expected: typecheck PASS, all Vitest suites PASS (money, summary, dateGroups, heatmap), build PASS.

- [ ] **Step 3: Commit**

```bash
cd $ROOT && git add README.md && git commit -m "docs: add README with setup and dev instructions"
```

---

## Self-Review

**Spec coverage:**
- Reuse vs. rewrite (spec §Architecture) → Tasks 1, 6, 8, 11 (reuse) and 3, 9, 10, 12–15 (rewrite). ✓
- Dropped share/backup/camera (spec §Dropped) → simply never ported; "change sheet" relocated to header in Task 15. ✓
- Data model `Transaction` (spec §Data model) → Task 3. ✓
- Categories preset + custom (spec §Categories) → Task 3 + datalist in Task 14. ✓
- Amount handling `money.ts` (spec §Amount handling) → Task 2; boundary coercion in Task 9 + Code.gs Task 18. ✓
- Screens: header/summary/heatmap/list + FAB + add/edit form (spec §Screens) → Tasks 12–15. ✓
- Spending heatmap: expense metric, 5 levels, ~26 weeks, tap-to-filter (spec §Heatmap) → Tasks 5 + 12; filter wired in Task 15. ✓
- Responsive (spec §Responsive) → Task 17 (breakpoints, FAB position, modal full-screen vs dialog). ✓
- Sync & error handling (spec §Sync) → Task 10 store + Task 15 toast wiring. ✓
- Testing money/heatmap + manual offline smoke (spec §Testing) → Tasks 2, 4, 5 unit tests; Task 18 manual smoke. ✓
- IDR + EN/ID (spec §Localization) → Task 2 money + Task 7 translations. ✓

**Placeholder scan:** No "TBD"/"implement later". The two "reconcile" steps (Task 15 pull-to-refresh API, Task 17 ported class names) are concrete verification steps against real ported files, not deferred work — every code file has complete content.

**Type consistency:** Store methods (`addTransaction`/`updateTransaction`/`deleteTransaction`/`syncNow`/`refresh`) match between Task 10's produced interface and Task 15's consumption. `TransactionFormData` shape (type/amount/category/date/note) is identical across Tasks 3, 9, 10, 14, 15. Cache functions `loadCachedTransactions`/`saveCachedTransactions` renamed consistently in Tasks 8 and 10. Heatmap `HeatCell`/`buildHeatmap` signatures match between Tasks 5 and 12. `groupByDate`/`relativeDay` match between Tasks 4 and 13.
