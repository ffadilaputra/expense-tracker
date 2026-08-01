import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearQueues,
  discardFailed,
  drainQueue,
  enqueue,
  entriesFor,
  loadFailed,
  loadQueue,
  retryFailed,
  saveQueue
} from './syncQueue';
import type { QueueEntry } from '../types';

class Rejection extends Error {}

const isRejection = (err: unknown) => err instanceof Rejection;

function entry(partial: Partial<QueueEntry> & { id: string }): QueueEntry {
  return { entity: 'transaction', type: 'add', payload: null, ...partial };
}

beforeEach(() => {
  localStorage.clear();
  clearQueues();
});

describe('legacy entries', () => {
  it('reads entries written before accounts existed as transactions', async () => {
    // The module caches the queue on first read, so the fixture has to be on
    // disk before a fresh copy of the module loads it.
    localStorage.setItem(
      'finance:queue',
      JSON.stringify([
        { type: 'add', id: 'old-1', payload: { amount: 5 } },
        { type: 'delete', id: 'old-2', payload: null }
      ])
    );
    vi.resetModules();
    const fresh = await import('./syncQueue');

    expect(fresh.loadQueue().map((e) => e.entity)).toEqual(['transaction', 'transaction']);
    expect(fresh.entriesFor('transaction').map((e) => e.id)).toEqual(['old-1', 'old-2']);
    expect(fresh.loadQueue()[0].payload).toEqual({ amount: 5 });
  });
});

describe('entriesFor', () => {
  it('returns only the entries belonging to that entity', () => {
    saveQueue([
      entry({ id: 't1', entity: 'transaction' }),
      entry({ id: 'a1', entity: 'account' }),
      entry({ id: 't2', entity: 'transaction' })
    ]);
    expect(entriesFor('account').map((e) => e.id)).toEqual(['a1']);
    expect(entriesFor('transaction').map((e) => e.id)).toEqual(['t1', 't2']);
  });
});

describe('drainQueue', () => {
  it('processes entries in order and empties the queue', async () => {
    saveQueue([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]);
    const seen: string[] = [];

    const result = await drainQueue(async (e) => {
      seen.push(e.id);
    }, isRejection);

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result.processed).toBe(3);
    expect(loadQueue()).toEqual([]);
  });

  it('dead-letters a rejected entry and keeps draining the rest', async () => {
    saveQueue([entry({ id: 'bad' }), entry({ id: 'good' })]);
    const seen: string[] = [];

    const result = await drainQueue(async (e) => {
      seen.push(e.id);
      if (e.id === 'bad') throw new Rejection('Transaction not found');
    }, isRejection);

    expect(seen).toEqual(['bad', 'good']);
    expect(result.processed).toBe(1);
    expect(result.deadLettered).toHaveLength(1);
    expect(loadQueue()).toEqual([]);
    expect(loadFailed()[0]).toMatchObject({ id: 'bad', reason: 'Transaction not found' });
  });

  it('preserves the rejected change rather than discarding it', async () => {
    saveQueue([entry({ id: 'bad', type: 'add', payload: { amount: 5000 } })]);

    await drainQueue(async () => {
      throw new Rejection('nope');
    }, isRejection);

    expect(loadFailed()[0].payload).toEqual({ amount: 5000 });
  });

  it('stops on a transport failure and leaves the entry queued', async () => {
    saveQueue([entry({ id: 'a' }), entry({ id: 'b' })]);
    const seen: string[] = [];

    const result = await drainQueue(async (e) => {
      seen.push(e.id);
      throw new TypeError('Failed to fetch');
    }, isRejection);

    expect(seen).toEqual(['a']);
    expect(result.processed).toBe(0);
    expect(result.transportError).toBeInstanceOf(TypeError);
    expect(loadQueue().map((e) => e.id)).toEqual(['a', 'b']);
    expect(loadFailed()).toEqual([]);
  });

  it('does nothing with an empty queue', async () => {
    const result = await drainQueue(async () => {}, isRejection);
    expect(result).toEqual({ processed: 0, deadLettered: [], transportError: null });
  });

  it('terminates when a dispatch removes entries from under it', async () => {
    saveQueue([entry({ id: 'a' }), entry({ id: 'b' })]);

    const result = await drainQueue(async () => {
      // Simulates deleteTransaction pulling its own queued entries mid-flight.
      saveQueue([]);
    }, isRejection);

    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(loadQueue()).toEqual([]);
  });
});

describe('failed entries', () => {
  it('puts them back on the queue when retried', async () => {
    saveQueue([entry({ id: 'bad' })]);
    await drainQueue(async () => {
      throw new Rejection('nope');
    }, isRejection);

    retryFailed();

    expect(loadQueue().map((e) => e.id)).toEqual(['bad']);
    expect(loadFailed()).toEqual([]);
  });

  it('strips the failure metadata on the way back', async () => {
    saveQueue([entry({ id: 'bad' })]);
    await drainQueue(async () => {
      throw new Rejection('nope');
    }, isRejection);

    retryFailed();

    expect(loadQueue()[0]).not.toHaveProperty('reason');
    expect(loadQueue()[0]).not.toHaveProperty('failedAt');
  });

  it('drops them on discard', async () => {
    saveQueue([entry({ id: 'bad' })]);
    await drainQueue(async () => {
      throw new Rejection('nope');
    }, isRejection);

    discardFailed();

    expect(loadFailed()).toEqual([]);
    expect(loadQueue()).toEqual([]);
  });
});

describe('enqueue', () => {
  it('appends to the end so order is preserved', () => {
    enqueue(entry({ id: 'a' }));
    enqueue(entry({ id: 'b' }));
    expect(loadQueue().map((e) => e.id)).toEqual(['a', 'b']);
  });
});
