# Debts and Instalments — Design

Date: 2026-08-02

## Problem

The app records what has already moved. It has nothing for money still owed:
a loan or an instalment purchase is invisible until each payment happens to be
logged as an ordinary expense, and nothing says how many payments remain, what
is due next, or whether one has been missed.

## Scope

**Money the user owes only.** Lending money out, interest calculations, partial
payments and early payoff are out of scope; each is additive to what follows.

## Data model

```ts
interface Debt {
  id: string;
  name: string;
  /** Total repayable, in IDR. Interest, if any, is already inside it. */
  totalAmount: number;
  instalmentCount: number;
  /** ISO date of instalment 1; the rest are spaced monthly from it. */
  firstDueDate: string;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}

interface DebtInstalment {
  id: string;
  debtId: string;
  /** 1-based position in the schedule. */
  number: number;
  /** Set only when overridden; otherwise the computed amount stands. */
  amount?: number;
  /** Set only when overridden. */
  dueDate?: string;
  /** Set when paid. */
  paidDate?: string;
  /** The expense this payment created. */
  transactionId?: string;
  createdAt: string;
  _pending?: boolean;
}
```

Two new tabs, each in the single connected spreadsheet alongside the existing
ones:

| Tab | Columns |
|---|---|
| `Debts` | id, name, totalAmount, instalmentCount, firstDueDate, note, createdAt |
| `DebtInstalments` | id, debtId, number, amount, dueDate, paidDate, transactionId, createdAt |

`DebtInstalments` is **sparse**: a row exists only for an instalment that
deviates from the computed default — one that has been edited or paid. A
24-month debt starts with no instalment rows at all rather than 24 placeholder
ones, so the tab stays proportional to activity rather than to schedule length.

## The schedule is computed

`utils/debt.ts` derives the full schedule from the header plus whatever
override rows exist. Two rules carry the weight and are covered by tests.

**Uneven division.** `12.000.000 / 7` does not divide evenly. The base
instalment is the floor of the division and the **last** instalment absorbs the
remainder, so the schedule sums to exactly `totalAmount`. Spreading the
remainder across early instalments would also sum correctly but makes every
figure look arbitrary; putting it at the end matches how instalment plans are
usually written.

**Month-end dates.** A first due date of 31 January has no counterpart in
February. Each date is computed from the *original* day of month and clamped to
the last day of the target month, so 31 Jan → 28 Feb → 31 Mar. Deriving each
date from the previous one instead would let the 28th stick permanently after a
single short month.

Overrides replace the computed amount or date for their instalment only; every
other instalment stays computed.

## Marking an instalment paid

The user picks an account and a date. Marking paid does two things:

1. Creates a transaction — `expense`, the instalment's amount, `category` set
   to the debt's name so it appears in the category filter and the breakdown
   ring, `note` reading "Instalment 9 of 24", against the chosen account.
2. Stores a `DebtInstalment` row carrying `paidDate` and `transactionId`.

Unmarking deletes that transaction and clears the row's paid fields.

Both changes go through the existing offline queue, so this works with no
connection.

### Why `add` must accept a supplied id

A transaction created offline is given a local id which is replaced with the
sheet's UUID once it syncs. The `transactionId` stored on the instalment would
then point at an id that no longer exists, and unmarking would fail to find the
expense to delete.

Rather than teach the store to rewrite foreign references, the `add` action in
`Code.gs` accepts an `id` when one is supplied and mints a UUID only when it is
not. The client generates the id up front, both rows agree from the start, and
nothing needs remapping. The `import` action already preserves supplied ids, so
this is the same behaviour reached through a second door.

## UI

A third bottom-nav tab, **Debts**, alongside Transactions and Accounts.

**Debts list.** Each debt shows its name, amount paid against amount
remaining, `9 of 24 paid`, the next due date, and an overdue marker when an
unpaid instalment is past its date. A total of everything still outstanding
sits at the foot.

**Debt detail.** The full schedule: every instalment with number, due date,
amount and status — paid, due, or overdue. Tapping an unpaid instalment opens
the pay dialog (account, date, amount). An edit affordance overrides the amount
or date for a single instalment.

**Debt form.** Name, total, instalment count, first due date, note. Deleting a
debt is refused while any instalment is paid, matching how account deletion
already refuses while rows reference it — the alternative is silently orphaning
expenses that are still in the ledger.

## Testing

`utils/debt.test.ts` — even and uneven division summing to exactly the total,
the remainder landing on the last instalment, month-end clamping including
31 Jan → 28 Feb → 31 Mar, February in a leap year, year rollover, overrides
replacing computed amount and date, paid/due/overdue derivation, next-due
selection, progress totals, and a single-instalment debt.

`google-apps-script/Code.test.ts` — CRUD for both tabs, `add` preserving a
supplied id and still minting one when absent, and deletion of a debt being
refused while an instalment is paid.

## Out of scope

Interest calculation, partial payments, early payoff, lending money out,
reminders or notifications, and attaching a debt to an account as a liability
that offsets balances.
