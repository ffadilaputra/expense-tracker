import { purge, readFromDisk, scheduleWrite } from './storage';
import type { QueueEntry, SyncEntity } from '../types';

const QUEUE_KEY = 'finance:queue';
const FAILED_KEY = 'finance:failed';

/** A change the sheet refused. Kept rather than dropped so nothing is lost. */
export interface FailedEntry extends QueueEntry {
  reason: string;
  failedAt: string;
}

export interface DrainResult {
  processed: number;
  deadLettered: FailedEntry[];
  /** Set when the drain stopped early because the request never landed. */
  transportError: Error | null;
}

let queueCache: QueueEntry[] | null = null;
let failedCache: FailedEntry[] | null = null;

/**
 * Entries written before accounts existed have no `entity`. They were all
 * transactions, so that is what they become - a user mid-sync across an update
 * must not have their queue silently misrouted or dropped.
 */
function withEntity(entry: QueueEntry): QueueEntry {
  return entry.entity ? entry : { ...entry, entity: 'transaction' };
}

export function loadQueue(): QueueEntry[] {
  if (queueCache === null) {
    queueCache = readFromDisk<QueueEntry[]>(QUEUE_KEY, []).map(withEntity);
  }
  return queueCache;
}

export function saveQueue(queue: QueueEntry[]): void {
  queueCache = queue;
  scheduleWrite(QUEUE_KEY, queue);
}

export function enqueue(entry: QueueEntry): QueueEntry[] {
  const next = [...loadQueue(), entry];
  saveQueue(next);
  return next;
}

export function loadFailed(): FailedEntry[] {
  if (failedCache === null) failedCache = readFromDisk<FailedEntry[]>(FAILED_KEY, []);
  return failedCache;
}

export function saveFailed(failed: FailedEntry[]): void {
  failedCache = failed;
  scheduleWrite(FAILED_KEY, failed);
}

/** Puts dead-lettered changes back at the end of the queue for another try. */
export function retryFailed(): void {
  const failed = loadFailed();
  if (failed.length === 0) return;
  saveQueue([...loadQueue(), ...failed.map(({ reason: _r, failedAt: _f, ...entry }) => entry)]);
  saveFailed([]);
}

export function discardFailed(): void {
  saveFailed([]);
}

export function clearQueues(): void {
  queueCache = [];
  failedCache = [];
  purge([QUEUE_KEY, FAILED_KEY]);
}

/** Entries for one entity, used by each store to rebuild its optimistic view. */
export function entriesFor(entity: SyncEntity): QueueEntry[] {
  return loadQueue().filter((e) => e.entity === entity);
}

/**
 * Drains the queue in order, one entry at a time.
 *
 * The two failure kinds are handled differently on purpose. A rejection means
 * the sheet understood the change and refused it, so it will be refused
 * identically on every retry - leaving it at the head would stall everything
 * behind it forever. It is moved to the dead-letter list and the drain carries
 * on. A transport failure means the request never arrived, which retrying will
 * fix, so the entry stays queued and the drain stops until the connection is
 * back.
 *
 * `isRejection` is injected rather than imported so this module stays free of
 * the API layer and can be tested on its own.
 */
export async function drainQueue(
  dispatch: (entry: QueueEntry) => Promise<void>,
  isRejection: (err: unknown) => boolean
): Promise<DrainResult> {
  const result: DrainResult = { processed: 0, deadLettered: [], transportError: null };

  // Guards against a head that never advances - if a concurrent delete already
  // removed the entry we are holding, filtering it out is a no-op and the loop
  // would otherwise spin on the same object.
  const attempted = new Set<QueueEntry>();

  for (;;) {
    const entry = loadQueue()[0];
    if (!entry || attempted.has(entry)) break;
    attempted.add(entry);

    try {
      await dispatch(entry);
      result.processed++;
    } catch (err) {
      if (!isRejection(err)) {
        result.transportError = err as Error;
        break;
      }
      const failed: FailedEntry = {
        ...entry,
        reason: (err as Error).message,
        failedAt: new Date().toISOString()
      };
      result.deadLettered.push(failed);
      saveFailed([...loadFailed(), failed]);
    }

    // Removal by object identity, not by index: a delete issued while the
    // request was in flight may have already pulled entries out from under us.
    saveQueue(loadQueue().filter((e) => e !== entry));
  }

  return result;
}
