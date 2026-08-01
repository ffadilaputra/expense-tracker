# Accounts and Transfers — Design

Date: 2026-08-01

## Problem

Every transaction currently lands in one undifferentiated pool. There is no way
to say which wallet, bank account, or e-wallet the money came from or went to,
so the app can report a single balance but cannot answer "how much is actually
in my BCA account". There is also no way to record moving money between two of
your own places without it looking like income or an expense.

Users want to:

1. Manage a list of accounts, each belonging to a named owner.
2. Choose an account when entering a transaction.
3. See a balance per account, subtotalled per owner.
4. Move money between accounts without distorting income/expense totals.

## Staging

Two stages behind one spec. Stage 2 depends on Stage 1; Stage 1 is useful on
its own and ships first.

**Stage 1** — accounts CRUD, owner grouping, `accountId` on transactions,
per-account balances, the Accounts screen, bottom navigation, and the sync
queue rework that all of it rests on.

**Stage 2** — transfers.

## Data model

```ts
interface Account {
  id: string;
  name: string;
  /** Free text. Blank groups under "No owner". */
  ownerName?: string;
  /** Single emoji, optional. */
  icon?: string;
  createdAt: string;
  _pending?: boolean;
}

interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}

interface Transaction {
  // ...existing fields unchanged
  /** '' or absent = Unassigned. Never required. */
  accountId?: string;
}
```

`Transaction.type` stays `'income' | 'expense'`. Transfers are a separate
entity in a separate tab, deliberately: making them a third transaction type
would force `computeTotals`, `buildHeatmap`, `computeSpendingTrend` and
`deriveCategories` to each grow a special case for a thing that is neither
earning nor spending.

`accountId` is optional. Existing transactions keep a blank value and are
reported under a derived **Unassigned** bucket, reassignable by editing the
transaction. No migration runs over existing data.

## Sheet schema

Each entity gets its **own tab**, inside the single spreadsheet the user already
connected. Account rows are never written into the `Transactions` tab, and
accounts are never local-only — they persist to the sheet exactly like
transactions do, through the same queue.

The Apps Script stays bound to that one spreadsheet via
`SpreadsheetApp.getActiveSpreadsheet()`, so there is no second file, no
spreadsheet ID to configure, and no extra authorization scope. `getSheet`
creates any tab that does not exist yet, so users do not have to make them by
hand.

| Tab | Columns |
|---|---|
| `Transactions` | id, type, amount, category, date, note, createdAt, **accountId** |
| `Accounts` | id, name, ownerName, icon, createdAt |
| `Transfers` | id, fromAccountId, toAccountId, amount, date, note, createdAt |

The `Transactions` tab stores only the `accountId` reference — an account's
name, owner and icon live solely in the `Accounts` tab, so renaming an account
does not require touching a single transaction row.

`accountId` is **appended** as the eighth column rather than inserted, so
existing rows keep their positions and existing data is untouched.

### Header reconciliation

`ensureHeaders` currently returns early once row 1 column 1 reads `id`, so it
would never add the new column to a sheet already in use — `accountId` would
silently never persist. It becomes `getSheet(name, headers)` and reconciles the
whole header row:

1. Grow the grid if it has fewer columns than the header list.
2. Empty sheet → write the header row.
3. Row 1 is not a header (column 1 is not `id`) → insert a header row above it,
   preserving the stranded transaction. This is the existing recovery path.
4. Any expected header cell that is blank or different → set it.

Step 4 is what migrates a live 7-column sheet to 8. Data rows shorter than the
header pad to `''` on read, so `accountId` reads as blank for old rows, which
is exactly the Unassigned case.

## Balances

```
balance(account) = Σ income(accountId) − Σ expense(accountId)
                 + Σ transfers in − Σ transfers out          (Stage 2)
```

`utils/accounts.ts` (pure, tested):

- `computeAccountBalances(accounts, transactions, transfers)` → balance per
  account id.
- `groupAccountsByOwner(...)` → owner groups, each with its accounts and a
  subtotal. Owners sort alphabetically; accounts with a blank owner form a
  **"No owner"** group sorted last, matching how `deriveCategories` already
  places its uncategorized chip.
- `computeUnassignedBalance(transactions)` → the bucket for transactions with
  no `accountId`.

Unassigned sits outside the owner groups — it is a set of transactions, not an
account, so it cannot belong to an owner. It renders between the last group and
the total.

**No opening balances.** An account starts at zero and reflects only what has
been logged, so a wallet that already held money reads low, and an account can
go negative. This is a deliberate scope choice; adding an `openingBalance`
column later is additive and does not change any of the above.

## API

`action=list` returns `{ transactions, accounts, transfers }` instead of a bare
transaction array — one round trip instead of three. The client tolerates the
old shape:

```ts
const payload = Array.isArray(data)
  ? { transactions: data, accounts: [], transfers: [] }
  : data;
```

so a stale Apps Script deployment degrades to transactions-only rather than
failing outright.

New POST actions: `addAccount`, `updateAccount`, `deleteAccount`, `addTransfer`,
`deleteTransfer`.

**`deleteAccount` refuses while the account is in use**, returning the number of
transactions and transfers that reference it. Silently unassigning financial
records is the wrong default; the user reassigns them first.

## Offline sync rework

`useTransactionStore` hardcodes a single entity throughout, and it is where both
of the bugs found this week lived. Three entities in that one file would make it
worse, so the queue mechanics move out:

**`offline/syncQueue.ts`** — generic over entity. Owns the queue array, the
FIFO drain loop, per-entry dispatch through an injected handler map, and the
failure policy. Knows nothing about transactions, accounts or transfers beyond
the `entity` tag.

**`hooks/useTransactionStore.ts`**, **`useAccountStore.ts`**, and (Stage 2)
**`useTransferStore.ts`** become thin: optimistic local update, enqueue,
delegate.

`QueueEntry` gains `entity: 'transaction' | 'account' | 'transfer'`. Entries
already sitting in users' localStorage have no such field and are read as
`'transaction'`.

### Head-of-line blocking

Today a permanently-refused entry sits at the head of the queue and `break`s the
drain loop on every attempt, so everything behind it is stuck too. With three
entity types a bad account write would freeze transaction syncing entirely.

The two failure kinds already separated by `ApiRejectionError` get different
handling:

- **Rejection** (server understood and refused; will be refused identically
  forever): move the entry to a dead-letter list at `finance:failed` and carry
  on with the rest of the queue. The change is preserved rather than discarded,
  and the queue drains.
- **Transport failure** (never arrived): leave the entry queued and break the
  loop, as now. Retrying is the right move once the connection returns.

`SyncStatus` shows the dead-letter count with the reason and offers **Retry**
(move them back to the queue) and **Discard**. Without this the user has no way
to act on a failure they can now finally see.

## UI

Bottom navigation with two tabs. `AppShell` currently renders the entire
transactions view inline and has grown accordingly; the view moves to
`TransactionsScreen.tsx` so `AppShell` is left as the shell — header,
navigation, modals, and the stores.

New components:

- `BottomNav.tsx` — Transactions / Accounts, `aria-pressed` idiom as elsewhere.
- `TransactionsScreen.tsx` — the existing main content, extracted unchanged.
- `AccountsScreen.tsx` — owner groups with subtotals, Unassigned row, total,
  add button, and (Stage 2) the Transfer action and transfer history.
- `AccountForm.tsx` — modal: name, owner (with a `datalist` of owners already in
  use, mirroring the category field), optional emoji.
- `TransferForm.tsx` — Stage 2. From, to, amount, date, note. From and to must
  differ.

Changed:

- `TransactionForm` gains an optional account `<select>` with a `(none)` option.
- `TransactionCard` shows the account name next to the category.

## Testing

- `utils/accounts.test.ts` — balances per account, owner grouping and subtotals,
  the No owner group and its ordering, the Unassigned bucket, transfer
  arithmetic in both directions, accounts with no transactions, empty input.
- `offline/syncQueue.test.ts` — FIFO order, rejection dead-letters and the drain
  continues, transport failure leaves the entry queued and stops, legacy entries
  without an `entity` field read as transactions.
- `google-apps-script/Code.test.ts` — extends the existing harness: migrating a
  live 7-column sheet to 8 without touching data, account CRUD, refusing to
  delete an account in use, transfer add and delete.

## Out of scope

Opening balances, archiving accounts, filtering the transaction list by owner,
per-account budgets, and multi-currency. Each is additive to this design.
