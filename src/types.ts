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
  /** Which account the money moved through. '' or absent = Unassigned. */
  accountId?: string;
  /** True while this row has offline changes not yet pushed to the sheet. */
  _pending?: boolean;
}

/** The fields a user actually edits in the form. */
export type TransactionFormData = Omit<Transaction, 'id' | 'createdAt' | '_pending'>;

/**
 * A place money sits — a wallet, bank account or e-wallet. Not built yet; the
 * shape is fixed by docs/superpowers/specs/2026-08-01-accounts-and-transfers-design.md
 * and defined here so the backup format can carry accounts from version 1
 * rather than needing a format bump the day they land.
 */
export interface Account {
  id: string;
  name: string;
  /** Free text. Blank groups under "No owner". */
  ownerName?: string;
  /** Single emoji, optional. */
  icon?: string;
  createdAt: string;
  _pending?: boolean;
}

/** Money moved between two of the user's own accounts. Not built yet. */
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}

/** A sum the user owes, repaid over a fixed number of monthly instalments. */
export interface Debt {
  id: string;
  name: string;
  /** Total repayable, IDR. Interest, if any, is already inside it. */
  totalAmount: number;
  instalmentCount: number;
  /** ISO date of instalment 1; the rest are spaced monthly from it. */
  firstDueDate: string;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}

/**
 * Stored only for an instalment that deviates from the computed schedule -
 * one that has been edited or paid. A 24-month debt starts with no rows.
 */
export interface DebtInstalment {
  id: string;
  debtId: string;
  /** 1-based position in the schedule. */
  number: number;
  /** Set only when overridden. */
  amount?: number;
  /** Set only when overridden. */
  dueDate?: string;
  paidDate?: string;
  /** The expense this payment created. */
  transactionId?: string;
  createdAt: string;
  _pending?: boolean;
}

/** Money set aside on purpose. Contributions are earmarks, not movements. */
export interface Saving {
  id: string;
  name: string;
  /** Single emoji, optional. */
  icon?: string;
  targetAmount: number;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}

/** One act of setting money aside toward a goal. Never touches the ledger. */
export interface SavingContribution {
  id: string;
  savingId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
  _pending?: boolean;
}

export type SyncOperation = 'add' | 'update' | 'delete';

/** Which collection a queued change belongs to. */
export type SyncEntity =
  | 'transaction'
  | 'account'
  | 'transfer'
  | 'debt'
  | 'debtInstalment'
  | 'saving'
  | 'savingContribution';

/** A queued change waiting to be pushed to Google Sheets once back online. */
export interface QueueEntry {
  /** Absent on entries written before accounts existed; read as 'transaction'. */
  entity: SyncEntity;
  type: SyncOperation;
  id: string;
  payload: Record<string, unknown> | null;
}

/** Shape returned by every Apps Script endpoint. */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}
