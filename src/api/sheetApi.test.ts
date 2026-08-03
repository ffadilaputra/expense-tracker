import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiRejectionError, deleteTransaction, fetchAll } from './sheetApi';

const API_URL = 'https://script.google.com/macros/d/abc/exec';

function mockFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

beforeEach(() => {
  localStorage.setItem('finance:api-url', API_URL);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('deleteTransaction', () => {
  it('throws ApiRejectionError carrying the server reason when the sheet refuses', async () => {
    mockFetch(async () => ({ json: async () => ({ success: false, error: 'Transaction not found' }) }));

    await expect(deleteTransaction('some-id')).rejects.toThrow(ApiRejectionError);
    await expect(deleteTransaction('some-id')).rejects.toThrow('Transaction not found');
  });

  it('throws a plain Error, not a rejection, when the request never lands', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const err = await deleteTransaction('some-id').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ApiRejectionError);
  });

  it('resolves when the sheet reports success', async () => {
    mockFetch(async () => ({ json: async () => ({ success: true }) }));
    await expect(deleteTransaction('some-id')).resolves.toBeUndefined();
  });

  it('rejects when no sheet is connected', async () => {
    localStorage.removeItem('finance:api-url');
    mockFetch(async () => ({ json: async () => ({ success: true }) }));
    await expect(deleteTransaction('some-id')).rejects.toThrow();
  });
});

describe('fetchAll', () => {
  it('normalizes rows coming back from the sheet', async () => {
    mockFetch(async () => ({
      json: async () => ({
        success: true,
        data: {
          transactions: [
            { id: 1, type: 'nonsense', amount: '2500', category: 7, date: '2026-08-01T00:00:00', note: null }
          ],
          accounts: [{ id: 'a1', name: 'BCA', ownerName: 'Budi' }],
          transfers: []
        }
      })
    }));

    const snapshot = await fetchAll();
    expect(snapshot.transactions[0]).toMatchObject({
      id: '1',
      type: 'expense',
      amount: 2500,
      category: '7',
      date: '2026-08-01',
      note: ''
    });
    expect(snapshot.accounts[0]).toMatchObject({ id: 'a1', name: 'BCA', ownerName: 'Budi' });
  });

  it('accepts the bare array an un-redeployed script still returns', async () => {
    // Old deployment: degrade to transactions-only rather than failing outright.
    mockFetch(async () => ({
      json: async () => ({
        success: true,
        data: [{ id: 'x', type: 'expense', amount: 100, category: 'Food', date: '2026-08-01' }]
      })
    }));

    const snapshot = await fetchAll();
    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.transfers).toEqual([]);
  });

  it('tolerates a response with no accounts key', async () => {
    mockFetch(async () => ({ json: async () => ({ success: true, data: { transactions: [] } }) }));

    const snapshot = await fetchAll();
    expect(snapshot).toEqual({
      transactions: [],
      accounts: [],
      transfers: [],
      debts: [],
      debtInstalments: [],
      savings: [],
      savingContributions: [],
      allocations: []
    });
  });
});
