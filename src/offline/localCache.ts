// Local-first storage layer built on localStorage - no external dependency.
// This is what lets the app open and be used (read & add recipes) even with
// no internet connection at all.
//
// Reads/writes are backed by an in-memory cache with the actual disk write
// (localStorage.setItem) debounced. Why: recipes can carry base64 camera
// photos (tens of KB each), so JSON.stringify-ing the whole array on every
// single add/update/delete - synchronously, inside the click handler - was
// blocking the main thread just long enough to feel like a visible lag
// before the UI updated, on both mobile and desktop. Reading/writing the
// in-memory cache is instant and always consistent; only the disk write is
// deferred and coalesced.

import type { QueueEntry, Transaction } from '../types';

const TRANSACTIONS_KEY = 'finance:transactions';
const QUEUE_KEY = 'finance:queue';
const WRITE_DEBOUNCE_MS = 150;

let transactionsCache: Transaction[] | null = null;
let queueCache: QueueEntry[] | null = null;
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function readFromDisk<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Schedules a debounced disk write for `key`. Multiple calls within the
 * debounce window (e.g. add immediately followed by delete) collapse into a
 * single localStorage.setItem with only the latest value - both fewer and
 * cheaper writes than writing on every call.
 */
function scheduleWrite(key: string, value: unknown): void {
  const pending = writeTimers.get(key);
  if (pending) clearTimeout(pending);

  const timer = setTimeout(() => {
    writeTimers.delete(key);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Storage full or blocked (private browsing, etc.) - fail silently,
      // the app still works off the in-memory cache for this session.
      console.warn(`Failed to persist ${key}:`, err);
    }
  }, WRITE_DEBOUNCE_MS);

  writeTimers.set(key, timer);
}

export function loadCachedTransactions(): Transaction[] {
  if (transactionsCache === null) transactionsCache = readFromDisk<Transaction[]>(TRANSACTIONS_KEY, []);
  return transactionsCache;
}

export function saveCachedTransactions(transactions: Transaction[]): void {
  transactionsCache = transactions;
  scheduleWrite(TRANSACTIONS_KEY, transactions);
}

// Queue of changes made offline (add/update/delete) that still need to be
// pushed to the Google Sheet. Processed strictly in order (FIFO) once the
// app is back online.
export function loadQueue(): QueueEntry[] {
  if (queueCache === null) queueCache = readFromDisk<QueueEntry[]>(QUEUE_KEY, []);
  return queueCache;
}

export function saveQueue(queue: QueueEntry[]): void {
  queueCache = queue;
  scheduleWrite(QUEUE_KEY, queue);
}

export function makeLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isLocalId(id: string): boolean {
  return id.startsWith('local-');
}

/** Wipes the local transaction cache and sync queue - used when switching sheets. */
export function clearCache(): void {
  writeTimers.forEach((timer) => clearTimeout(timer));
  writeTimers.clear();
  transactionsCache = [];
  queueCache = [];
  localStorage.removeItem(TRANSACTIONS_KEY);
  localStorage.removeItem(QUEUE_KEY);
}
