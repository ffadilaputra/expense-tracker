// localStorage primitives shared by the transaction cache and the sync queue.
//
// Reads/writes are backed by an in-memory cache with the disk write debounced.
// Why: JSON.stringify-ing the whole array on every add/update/delete -
// synchronously, inside the click handler - was blocking the main thread just
// long enough to feel like a visible lag before the UI updated. Reading and
// writing the in-memory value is instant and always consistent; only the disk
// write is deferred and coalesced.

const WRITE_DEBOUNCE_MS = 150;

const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function readFromDisk<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Schedules a debounced disk write for `key`. Multiple calls within the window
 * (an add immediately followed by a delete, say) collapse into a single
 * setItem with only the latest value.
 */
export function scheduleWrite(key: string, value: unknown): void {
  const pending = writeTimers.get(key);
  if (pending) clearTimeout(pending);

  const timer = setTimeout(() => {
    writeTimers.delete(key);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Storage full or blocked (private browsing, etc.) - fail silently, the
      // app still works off the in-memory value for this session.
      console.warn(`Failed to persist ${key}:`, err);
    }
  }, WRITE_DEBOUNCE_MS);

  writeTimers.set(key, timer);
}

/** Drops any pending write for these keys and removes them from disk. */
export function purge(keys: string[]): void {
  for (const key of keys) {
    const pending = writeTimers.get(key);
    if (pending) clearTimeout(pending);
    writeTimers.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing useful to do; the in-memory reset by the caller still holds.
    }
  }
}
