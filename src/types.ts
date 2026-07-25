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
