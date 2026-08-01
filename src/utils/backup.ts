import { normalizeAccount, normalizeTransaction, normalizeTransfer } from './normalize';
import type { Account, Transaction, Transfer } from '../types';

export const BACKUP_FORMAT = 'uang-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  transactions: Transaction[];
  accounts: Account[];
  transfers: Transfer[];
}

/** Anything carrying an id, which is all three entities. */
interface Identified {
  id: string;
}

export type ParseResult =
  | { ok: true; data: BackupFile }
  | { ok: false; error: string };

/**
 * `_pending` is deliberately dropped: it records whether *this device* still
 * owes the sheet a write, so restoring it elsewhere would mark rows as unsynced
 * on a device that never queued them.
 */
export function buildBackup(
  transactions: Transaction[],
  accounts: Account[],
  transfers: Transfer[]
): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: transactions.map(normalizeTransaction),
    accounts: accounts.map(normalizeAccount),
    transfers: transfers.map(normalizeTransfer)
  };
}

function readArray(value: unknown): unknown[] {
  // Absent is fine - a file exported before accounts existed has no such key,
  // and must still restore. Present but not an array is a broken file.
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('malformed');
  return value;
}

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }

  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'notBackup' };
  const file = raw as Record<string, unknown>;

  if (file.format !== BACKUP_FORMAT) return { ok: false, error: 'notBackup' };

  const version = Number(file.version);
  if (!Number.isFinite(version) || version < 1) return { ok: false, error: 'notBackup' };
  if (version > BACKUP_VERSION) return { ok: false, error: 'tooNew' };

  let transactions: unknown[];
  let accounts: unknown[];
  let transfers: unknown[];
  try {
    transactions = readArray(file.transactions);
    accounts = readArray(file.accounts);
    transfers = readArray(file.transfers);
  } catch {
    return { ok: false, error: 'malformed' };
  }

  // A row with no id cannot be merged, deduplicated or later edited, so it is
  // dropped rather than imported as an unreachable orphan.
  const withId = <T extends Identified>(rows: T[]): T[] => rows.filter((r) => r.id !== '');

  return {
    ok: true,
    data: {
      format: BACKUP_FORMAT,
      version,
      exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
      transactions: withId(transactions.map((r) => normalizeTransaction(r as Partial<Transaction>))),
      accounts: withId(accounts.map((r) => normalizeAccount(r as Partial<Account>))),
      transfers: withId(transfers.map((r) => normalizeTransfer(r as Partial<Transfer>)))
    }
  };
}

/**
 * What a restore would do, without doing it. Ids repeated within the incoming
 * file count once as added and the rest as skipped, matching the server, which
 * treats each row as already present once its predecessor has been written.
 */
export function summarizeRestore(
  local: Identified[],
  incoming: Identified[]
): { added: number; skipped: number } {
  const seen = new Set(local.map((r) => r.id));
  let added = 0;
  let skipped = 0;

  for (const row of incoming) {
    if (seen.has(row.id)) {
      skipped++;
      continue;
    }
    seen.add(row.id);
    added++;
  }

  return { added, skipped };
}
