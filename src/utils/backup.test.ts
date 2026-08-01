import { describe, it, expect } from 'vitest';
import { BACKUP_FORMAT, BACKUP_VERSION, buildBackup, parseBackup, summarizeRestore } from './backup';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'a', type: 'expense', amount: 1000, category: 'Food', date: '2026-08-01',
    note: '', createdAt: '2026-08-01T00:00:00.000Z', ...partial
  };
}

describe('buildBackup', () => {
  it('stamps the format, version and an export timestamp', () => {
    const file = buildBackup([], [], []);
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(Date.parse(file.exportedAt)).not.toBeNaN();
  });

  it('carries accounts and transfers as empty arrays before those features exist', () => {
    const file = buildBackup([tx({})], [], []);
    expect(file.accounts).toEqual([]);
    expect(file.transfers).toEqual([]);
  });

  it('strips _pending, which is local sync state rather than user data', () => {
    const file = buildBackup([tx({ _pending: true })], [], []);
    expect(file.transactions[0]).not.toHaveProperty('_pending');
  });

  it('survives a round trip through JSON with every field intact', () => {
    const original = tx({ id: 'x1', note: 'Lunch', category: 'Food', amount: 52500 });
    const parsed = parseBackup(JSON.stringify(buildBackup([original], [], [])));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.transactions[0]).toEqual({
      id: 'x1', type: 'expense', amount: 52500, category: 'Food',
      date: '2026-08-01', note: 'Lunch', createdAt: '2026-08-01T00:00:00.000Z'
    });
  });
});

describe('parseBackup', () => {
  function fileWith(overrides: Record<string, unknown>): string {
    return JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: '2026-08-01T00:00:00.000Z',
      transactions: [],
      accounts: [],
      transfers: [],
      ...overrides
    });
  }

  it('rejects text that is not JSON at all', () => {
    const result = parseBackup('not json {{{');
    expect(result.ok).toBe(false);
  });

  it('rejects JSON that is not a backup file', () => {
    const result = parseBackup(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a version newer than this build understands', () => {
    const result = parseBackup(fileWith({ version: BACKUP_VERSION + 1 }));
    expect(result.ok).toBe(false);
  });

  it('accepts a file with no accounts or transfers key at all', () => {
    const result = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: '2026-08-01T00:00:00.000Z',
        transactions: [tx({})]
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.accounts).toEqual([]);
    expect(result.data.transfers).toEqual([]);
  });

  it('drops rows with no usable id rather than importing junk', () => {
    const result = parseBackup(fileWith({ transactions: [tx({}), { amount: 5 }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transactions).toHaveLength(1);
  });

  it('coerces loose field types the way the sheet layer does', () => {
    const result = parseBackup(
      fileWith({
        transactions: [
          { id: 7, type: 'nonsense', amount: '2500', category: 9, date: '2026-08-01T00:00:00', note: null }
        ]
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transactions[0]).toMatchObject({
      id: '7', type: 'expense', amount: 2500, category: '9', date: '2026-08-01', note: ''
    });
  });

  it('rejects a transactions value that is not an array', () => {
    expect(parseBackup(fileWith({ transactions: 'nope' })).ok).toBe(false);
  });
});

describe('summarizeRestore', () => {
  it('counts incoming rows as new or already present by id', () => {
    const local = [tx({ id: 'a' }), tx({ id: 'b' })];
    const incoming = [tx({ id: 'b' }), tx({ id: 'c' }), tx({ id: 'd' })];
    expect(summarizeRestore(local, incoming)).toEqual({ added: 2, skipped: 1 });
  });

  it('reports everything as new against empty local data', () => {
    expect(summarizeRestore([], [tx({ id: 'a' })])).toEqual({ added: 1, skipped: 0 });
  });

  it('reports everything as skipped when re-importing the same data', () => {
    const rows = [tx({ id: 'a' }), tx({ id: 'b' })];
    expect(summarizeRestore(rows, rows)).toEqual({ added: 0, skipped: 2 });
  });

  it('counts a duplicate id inside the incoming file only once', () => {
    expect(summarizeRestore([], [tx({ id: 'a' }), tx({ id: 'a' })])).toEqual({ added: 1, skipped: 1 });
  });

  it('is zero for an empty file', () => {
    expect(summarizeRestore([tx({ id: 'a' })], [])).toEqual({ added: 0, skipped: 0 });
  });
});
