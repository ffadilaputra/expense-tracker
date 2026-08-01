import { describe, it, expect } from 'vitest';
import { normalizeAccount, normalizeTransaction, normalizeTransfer } from './normalize';

describe('normalizeTransaction', () => {
  it('keeps the account the row is assigned to', () => {
    // Dropping this silently unassigned every transaction on every read: the
    // form showed "No account" and every balance collapsed into Unassigned,
    // while the sheet held the right value all along.
    const txn = normalizeTransaction({
      id: 't1', type: 'expense', amount: 5000, category: 'Food',
      date: '2026-08-01', createdAt: 'ts', accountId: 'acc-1'
    });
    expect(txn.accountId).toBe('acc-1');
  });

  it('reads a missing account as unassigned rather than undefined', () => {
    expect(normalizeTransaction({ id: 't1' }).accountId).toBe('');
    expect(normalizeTransaction({ id: 't1', accountId: undefined }).accountId).toBe('');
  });

  it('coerces a numeric account id from the sheet to a string', () => {
    expect(normalizeTransaction({ id: 't1', accountId: 7 as never }).accountId).toBe('7');
  });

  it('clamps an unknown type to expense', () => {
    expect(normalizeTransaction({ id: 't1', type: 'nonsense' as never }).type).toBe('expense');
  });

  it('trims a timestamp date down to the calendar day', () => {
    expect(normalizeTransaction({ id: 't1', date: '2026-08-01T09:30:00.000Z' }).date).toBe('2026-08-01');
  });

  it('falls back to zero for an unparseable amount', () => {
    expect(normalizeTransaction({ id: 't1', amount: 'abc' as never }).amount).toBe(0);
  });
});

describe('normalizeAccount', () => {
  it('keeps name, owner and icon', () => {
    const account = normalizeAccount({ id: 'a1', name: 'BCA', ownerName: 'Budi', icon: '🏦' });
    expect(account).toMatchObject({ id: 'a1', name: 'BCA', ownerName: 'Budi', icon: '🏦' });
  });

  it('reads a missing owner and icon as blank', () => {
    const account = normalizeAccount({ id: 'a1', name: 'Cash' });
    expect(account.ownerName).toBe('');
    expect(account.icon).toBe('');
  });
});

describe('normalizeTransfer', () => {
  it('keeps both ends', () => {
    const transfer = normalizeTransfer({
      id: 'x1', fromAccountId: 'a', toAccountId: 'b', amount: 500000, date: '2026-08-01'
    });
    expect(transfer).toMatchObject({ fromAccountId: 'a', toAccountId: 'b', amount: 500000 });
  });
});
