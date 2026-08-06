# New Version Available — Design

Date: 2026-08-05

## Problem

`public/sw.js` calls `self.skipWaiting()` during install (`public/sw.js:22`) and
`self.clients.claim()` on activate. A new build therefore takes over the *cache*
immediately and silently — while the open page carries on executing the
JavaScript it loaded at start-up. Nothing tells the user a newer build exists,
and nothing offers to load it.

In a browser tab this resolves itself at the next navigation. In the installed
PWA — the way the app is meant to be used — there may be no navigation for
weeks: resuming from the app switcher restores the existing document. Someone
can be running a build many deploys old with no way to find out.

`skipWaiting()` also makes this undetectable *by construction*. The standard
signal that an update is ready is a worker parked in the `waiting` state;
skipping that step means there is nothing for the app to observe.

## Scope

A dismissible banner that appears when a new build is installed and ready, with
a **Reload** action that activates it and reloads the page without losing
pending local writes.

Out of scope: automatic or forced reloading, release notes, a version string in
the UI, and update checking for the Apps Script backend (a separate concern —
that URL is user-supplied at runtime).

---

## 1. Detection: the waiting worker

`sw.js` stops skipping the wait, so a new build installs and then parks:

```js
// install: no more self.skipWaiting()

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
```

`clients.claim()` stays in activate. It is what fires `controllerchange` in the
page once the new worker takes over, which is the signal the reload hangs off.

`CACHE_NAME` stays at `finance-app-shell-v2`: the comment above it
(`public/sw.js:12`) ties a bump to a change in `PRECACHE_URLS`, and that list is
untouched.

### The first-install trap

`controllerchange` also fires on a user's **first ever** visit: the worker
installs, activates, and claims a page that had no controller. Reloading on
every `controllerchange` would give every new user a spurious reload on their
first visit — a reasonable-looking implementation with an unpleasant bug.

The distinguishing fact is `navigator.serviceWorker.controller`: a first install
has none, an update has one. That check gates the banner, and the reload itself
is additionally gated on a flag set by the button handler, so only a
user-initiated activation ever reloads the page.

## 2. The hook

`src/hooks/useServiceWorkerUpdate.ts`, in the shape of the existing
`useInstallPrompt` (`src/hooks/useInstallPrompt.ts`) — a hook that wraps one
piece of platform machinery and hands the component two booleans and an action:

```ts
export interface ServiceWorkerUpdateState {
  /** True once a new worker is installed and waiting to take over. */
  updateReady: boolean;
  /** Flushes pending writes, activates the waiting worker, reloads. */
  reload: () => void;
}
```

It attaches off `navigator.serviceWorker.ready` rather than reaching for the
registration directly, because `main.tsx:31` registers on `window.load` and the
hook can mount first. Once resolved it checks `registration.waiting` (an update
that finished installing before the page opened) and subscribes to `updatefound`
→ `installing.statechange === 'installed'` (one that lands while the page is
open). Both paths are additionally gated on `controller` being non-null, per §1.

The decision itself is extracted as a pure function so it can be tested without
a service worker:

```ts
export function shouldPromptUpdate(
  registration: Pick<ServiceWorkerRegistration, 'waiting'>,
  controller: ServiceWorker | null
): boolean;
```

`reload()` calls `flushWrites()` (§3), posts `{ type: 'SKIP_WAITING' }` to the
waiting worker, and reloads on the next `controllerchange`. A 3-second fallback
timer reloads anyway if that event never arrives — a waiting worker can be
discarded by the browser between render and click, and a Reload button that does
nothing is worse than one that reloads slightly early.

## 3. Not losing writes

`src/offline/storage.ts:28` debounces every `localStorage` write by 150ms and
exposes no way to force one. A reload fired inside that window drops the write —
in this app, a transaction the user just saved. The odds are low; the failure is
silent data loss in a finance app, which is not a failure worth accepting.

`writeTimers` currently holds only the timer, so a flush has nothing to write.
It becomes `Map<string, { timer, value }>`, which lets the pending value be
persisted on demand:

```ts
/** Runs every pending debounced write immediately. */
export function flushWrites(): void;
```

`purge()` (`src/offline/storage.ts:47`) is updated for the new map shape. It must
keep dropping pending writes rather than flushing them — purging is how
"switch Google Sheet" clears the device (`src/App.tsx:24`), and resurrecting a
queued write there would restore data the user asked to be rid of.

The sync queue needs nothing further: it already lives in `localStorage`
(`src/offline/syncQueue.ts:4`), so once writes are flushed a reload is safe and
the queue drains against the new build exactly as it would have against the old.

## 4. Check cadence

**Assumption made in the absence of an answer** — this was raised during design
and is called out here because it is the one decision not explicitly approved.
It is self-contained; deleting it leaves the rest of the feature working.

The browser revalidates `sw.js` on navigation, and `netlify.toml` already serves
it `max-age=0, must-revalidate` so that check is never answered from cache. But
a resumed PWA performs no navigation, which is precisely the case §Problem
exists for: without a nudge, the audience that most needs this banner is the
audience least likely to see it.

So the hook also calls `registration.update()` when the document becomes
visible, throttled to at most once every 15 minutes:

```ts
document.addEventListener('visibilitychange', ...)  // → registration.update()
```

This is not the version-polling approach that was considered and rejected: no
new endpoint, no build stamp baked into the bundle, no recurring request. It
asks the browser to run the check it already knows how to run, at the moment the
user has come back to the app.

## 5. The banner

`src/components/UpdatePrompt.tsx` and `UpdatePrompt.css`, mirroring
`InstallPrompt.tsx` — same top-banner shape, same `__icon` / `__text` /
`__actions` class structure, so the two read as one pattern rather than two:

```
┌─────────────────────────────────┐
│ ✨  New version available       │
│                [ Reload ]   ✕   │
└─────────────────────────────────┘
│  Balance                        │
│  Rp 1.240.000                   │
```

Rendered in `App.tsx` beside `<InstallPrompt />` (`src/App.tsx:30`), outside the
`apiUrl` gate, so it also appears for someone sitting on the login screen.

### Dismissal

`✕` sets component state and persists **nothing**. This is a deliberate
departure from `InstallPrompt`, which writes a permanent
`finance:install-dismissed` flag (`src/components/InstallPrompt.tsx:7`).

Install is a one-time offer and deserves a permanent no. An update recurs, and a
permanently silenced update banner is a user stuck on an old build forever. The
worker stays parked either way, so the banner returns on the next load and the
update lands whenever they next reload of their own accord.

## 6. Internationalisation

Two keys in both `en` and `id` (`src/i18n/translations.ts`). The
`Record<TranslationKey, string>` annotation makes a missing Indonesian string a
compile error:

- `updateAvailableText` — "New version available" / "Versi baru tersedia"
- `reloadBtn` — "Reload" / "Muat ulang"

The existing `closeBtn` label is reused for the `✕`, as `InstallPrompt` does
(`src/components/InstallPrompt.tsx:63`), rather than adding a second word for
the same button.

## 7. Error handling

- **No `serviceWorker` in `navigator`**, or registration blocked (private
  browsing, insecure origin): the hook stays inert and `updateReady` never turns
  true, so the banner never renders. Nothing throws — matching how `main.tsx:31`
  already swallows a failed registration.
- **Waiting worker gone at click time**: the 3s fallback timer reloads anyway
  (§2).
- **`localStorage` full or blocked during flush**: already caught per key by the
  existing try/catch (`src/offline/storage.ts:36`); the reload proceeds.
- **Dismissed while an update waits**: banner returns on next load (§5).

## 8. Testing

`vitest.config.ts:7` includes `*.test.ts` only — not `.tsx` — so the existing
suite is entirely pure logic and there is no component-testing setup. This
follows that split rather than introducing one.

**`src/offline/storage.test.ts`** (new — the module has no tests today)
- `flushWrites` persists a pending value immediately, before the 150ms timer.
- A flushed key does not write a second time when its timer would have fired.
- `purge` still *drops* pending writes; a later `flushWrites` does not resurrect
  them.
- `flushWrites` with nothing pending is a no-op.

**`src/hooks/swUpdate.test.ts`**
- `shouldPromptUpdate` is false with no waiting worker.
- False with a waiting worker but a null controller — the first-install case
  from §1, which is the whole reason the function exists.
- True with both.

**`tests/pwaMeta.test.ts`** (extending the existing file, which already reads
source files from disk and asserts on their contents)
- `sw.js` does not call `skipWaiting()` at install scope — the regression guard
  against someone reinstating that line and silently killing the feature.
- `sw.js` does handle a `SKIP_WAITING` message.

The service worker lifecycle itself is not simulated. It is verified once by
hand: build, serve, deploy a change, confirm the banner appears and Reload
swaps the build.

## 9. Risks

- **Reload with an unsaved form open.** A half-filled transaction form is lost —
  `flushWrites` protects committed data, not in-progress input. Accepted for
  now: guarding it needs a global "a form is dirty" signal that does not exist,
  and the button is explicitly labelled, pressed deliberately, and dismissible.
- **Dropping `skipWaiting` delays cache updates for users who never reload.** By
  design — that silent swap is what made the current behaviour undetectable. The
  banner is the replacement, and the fallback is unchanged: the update still
  lands on the next natural navigation.
- **Throttled `update()` calls add a request per resume**, at most one per 15
  minutes. `sw.js` is ~2KB and `must-revalidate` means most of those answer
  `304`.
