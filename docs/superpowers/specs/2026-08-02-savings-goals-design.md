# Savings Goals — Design

Date: 2026-08-02

## Problem

The app records what has moved and, since the debts feature, what is owed. It
has no place for money being set aside on purpose. Saving toward something is
currently invisible: the balance goes up, and nothing says why or how far along
the intention is.

## Model

A contribution is an **earmark**, not a movement. Adding to a goal records that
some of the money already in the user's accounts is spoken for; it does not
create a transaction, does not change any balance, and does not appear in the
month's totals.

This is the opposite choice from debt instalments, which do create a real
expense. The difference is real rather than arbitrary: paying an instalment is
money leaving, while putting money toward a goal is money staying put with a
label on it.

## Data model

```ts
interface Saving {
  id: string;
  name: string;
  /** Single emoji, optional. */
  icon?: string;
  targetAmount: number;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}

interface SavingContribution {
  id: string;
  savingId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}
```

| Tab | Columns |
|---|---|
| `Savings` | id, name, icon, targetAmount, note, createdAt |
| `SavingContributions` | id, savingId, amount, date, note, createdAt |

`SavingContributions` is **not** sparse, unlike `DebtInstalments`: every
contribution is a distinct event with its own date and amount, so each needs a
row of its own. There is no computed schedule to deviate from.

**Deleting a goal deletes its contributions.** This is the opposite of the debt
rule, deliberately. A debt payment *is* an expense sitting in the ledger, so
dropping the debt would orphan a real financial record — hence the refusal. A
savings contribution is only an earmark that nothing outside the goal
references, so cascading destroys no record that exists anywhere else.

## Progress

`utils/savings.ts`, pure and tested:

- `summarizeSaving(saving, contributions)` → `savedAmount`, `remainingAmount`,
  `fraction` (0..1), `isComplete`, `contributionCount`.
- `summarizeAllSavings(savings, contributions)` → totals across every goal plus
  the per-goal rows, shared by the grid and the summary card so the two cannot
  drift apart. This mirrors `summarizeAllDebts`.

Two rules worth stating:

**A zero or negative target never divides.** `fraction` is 0 when the target is
not positive, rather than `Infinity` or `NaN` reaching a style attribute.

**Overfunding is allowed and shown honestly.** Contributing past the target
reports the true saved amount and a `remainingAmount` of 0, while `fraction`
clamps at 1 so the bar never draws past its own track.

## UI

**Fourth bottom-nav tab, Savings.** The goals are a grid —
`repeat(auto-fill, minmax(150px, 1fr))` — which gives two columns on a phone
and more on a desktop without a breakpoint per size. Each card carries the
icon, the name, a progress bar, `saved / target` and a percentage. Completed
goals are marked and sort last.

**Goal detail** opens on tap: contribution history newest first, a form to add
one (amount, date, optional note), delete on each contribution, and edit/delete
for the goal itself.

**Summary card** on the transactions page, below the debt card: total saved
across all goals, overall progress, and how many are complete.

**A line on the savings screen states that the money is still in the user's
accounts.** Without it, a card reading "Rp 2.500.000 saved" alongside a balance
that never moved invites the reading that savings are a separate pot. The whole
point of the earmark model is that they are not.

## Consequence accepted

Because contributions are earmarks, the hero balance still counts money that
has been set aside, and the app will never warn that the user is about to spend
what they had earmarked. That is inherent to tracking intent rather than
movement. The natural follow-up, if it ever grates, is an "available" figure on
the summary — balance minus earmarks — which is additive and out of scope here.

## Testing

`utils/savings.test.ts` — progress fractions, a zero and a negative target not
dividing by zero, overfunding clamping the fraction while reporting the true
amount, completion, a goal with no contributions, contributions belonging to
another goal being ignored, and the all-goals totals including the completed
count and ordering.

`google-apps-script/Code.test.ts` — CRUD for both tabs, the combined list
returning them, no tab created before a goal exists, and deleting a goal
removing its contributions.

## Out of scope

Target dates and required-per-month figures, withdrawals as negative
contributions, linking a goal to a specific account, netting earmarks off the
balance, and recurring or automatic contributions.
