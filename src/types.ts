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
