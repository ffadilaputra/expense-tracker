// Coercion for rows arriving from outside the app - the Google Sheet, or a
// backup file a user may have hand-edited. Google Sheets types cells by
// content, so a note typed as "123" arrives as a number and a date cell may
// arrive as a full timestamp. Every field is forced to the type our model
// promises so a malformed cell can never crash the list or the summary.

import type { Account, Debt, DebtInstalment, Transaction, Transfer } from '../types';

export function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeTransaction(raw: Partial<Transaction>): Transaction {
  return {
    id: str(raw.id),
    type: raw.type === 'income' ? 'income' : 'expense',
    amount: num(raw.amount),
    category: str(raw.category),
    date: str(raw.date).slice(0, 10),
    note: raw.note == null ? '' : str(raw.note),
    createdAt: str(raw.createdAt),
    accountId: raw.accountId == null ? '' : str(raw.accountId)
  };
}

export function normalizeAccount(raw: Partial<Account>): Account {
  return {
    id: str(raw.id),
    name: str(raw.name),
    ownerName: raw.ownerName == null ? '' : str(raw.ownerName),
    icon: raw.icon == null ? '' : str(raw.icon),
    createdAt: str(raw.createdAt)
  };
}

export function normalizeTransfer(raw: Partial<Transfer>): Transfer {
  return {
    id: str(raw.id),
    fromAccountId: str(raw.fromAccountId),
    toAccountId: str(raw.toAccountId),
    amount: num(raw.amount),
    date: str(raw.date).slice(0, 10),
    note: raw.note == null ? '' : str(raw.note),
    createdAt: str(raw.createdAt)
  };
}

export function normalizeDebt(raw: Partial<Debt>): Debt {
  return {
    id: str(raw.id),
    name: str(raw.name),
    totalAmount: num(raw.totalAmount),
    instalmentCount: num(raw.instalmentCount),
    firstDueDate: str(raw.firstDueDate).slice(0, 10),
    note: raw.note == null ? '' : str(raw.note),
    createdAt: str(raw.createdAt)
  };
}

/**
 * `amount` and `dueDate` stay undefined when the sheet holds a blank: blank
 * means "not overridden", which is not the same as an instalment of zero.
 */
export function normalizeInstalment(raw: Partial<DebtInstalment>): DebtInstalment {
  const amount = raw.amount;
  return {
    id: str(raw.id),
    debtId: str(raw.debtId),
    number: num(raw.number),
    amount: amount == null || amount === ('' as unknown) ? undefined : num(amount),
    dueDate: raw.dueDate ? str(raw.dueDate).slice(0, 10) : undefined,
    paidDate: raw.paidDate ? str(raw.paidDate).slice(0, 10) : undefined,
    transactionId: raw.transactionId ? str(raw.transactionId) : undefined,
    createdAt: str(raw.createdAt)
  };
}
