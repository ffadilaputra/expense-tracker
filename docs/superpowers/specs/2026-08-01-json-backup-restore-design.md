# JSON Backup and Restore — Design

Date: 2026-08-01

## Problem

All data lives in one Google Sheet. If that sheet is deleted, corrupted, or
edited by hand into an unusable state, there is nothing to fall back on. There
is also no way to move data to a different sheet: "Change Sheet" clears the
local cache and starts empty.

Users want to export everything to a file they hold, and restore it later.

## Format

```json
{
  "format": "uang-backup",
  "version": 1,
  "exportedAt": "2026-08-01T12:34:56.000Z",
  "transactions": [ ... ],
  "accounts": [ ... ],
  "transfers": [ ... ]
}
```

`accounts` and `transfers` are carried from the start even though those
features are not built yet, following the shapes fixed in
`2026-08-01-accounts-and-transfers-design.md`. They export as empty arrays
until then. Restore treats a missing or empty array as "nothing of that kind",
so a file exported today restores cleanly into a later build.

`_pending` is stripped on export: it is local sync state, not user data, and
restoring it would mark rows as unsynced on a device that never queued them.

`version` is refused if it is greater than the running app's, since a newer
file may carry fields this build would silently drop.

## Export

Build the object from the store's current data, then `Blob` →
`URL.createObjectURL` → a temporary anchor click, named
`uang-backup-YYYY-MM-DD.json`.

Works offline — the data is already local. Rows still queued for sync are
included; they are the user's data whether or not the sheet has caught up yet.

## Restore

Merge by id: rows whose id already exists are skipped, new ones are added,
nothing is ever deleted. Re-importing the same file twice changes nothing.

### Why this needs a server-side action

`addTransaction` in `Code.gs` calls `Utilities.getUuid()` and ignores any
incoming id. Restoring through the normal add path would therefore renumber
every row, and re-importing the same file would duplicate everything instead of
skipping it — defeating the point of merging by id.

Restore posts a single `import` action carrying all three arrays. The script
appends only rows whose id is not already present in the target tab, preserving
ids exactly as given, and returns `{ added, skipped }` per entity. The merge
happens where the data lives, in one request rather than N queued writes.

### Online requirement

Restore is a bulk write to the sheet. Routing it through the offline queue
would mean thousands of individual entries with a poor failure mode, so restore
requires a connection. The button is disabled offline with the reason shown.

After a successful import the client refreshes from the sheet, so local state
comes from the authoritative copy rather than being patched locally.

## Modules

**`utils/backup.ts`** — pure, tested:

- `buildBackup(transactions, accounts, transfers): BackupFile`
- `parseBackup(text): { ok: true; data: BackupFile } | { ok: false; error: string }`
  — validates that the text parses, that `format` matches, that `version` is
  not from the future, and that each row carries the required fields with the
  right types, coercing the way `normalizeTransaction` already does.
- `summarizeRestore(local, incoming): { added: number; skipped: number }` per
  entity, for the pre-restore preview.

**`components/BackupPanel.tsx`** — a modal reached from the header. Export
button, file picker, and a summary shown before anything is written:

```
backup-2026-08-01.json
  47 transactions — 35 new, 12 already present
   3 accounts     —  3 new
                        [ Cancel ]  [ Restore ]
```

`summarizeRestore` is a separate function precisely so this preview exists: it
is the only thing standing between a mis-picked file and a surprise write.

## Header

The `⋯` header button currently calls `onChangeSheet` directly. It becomes a
small menu with two items, Backup & Restore and Change Sheet, since there are
now two destinations behind one control.

## Apps Script

New POST action `import`, taking `{ transactions, accounts, transfers }`. For
each tab it reads existing ids once, appends the rows not already present in a
single `setValues` write rather than one `appendRow` per row, and returns
per-entity counts.

Rows are normalized on the way in with the same helpers the other actions use,
so a hand-edited backup file cannot write malformed cells.

## Testing

`utils/backup.test.ts` — round trip preserves every field; `_pending` stripped;
malformed JSON, foreign JSON, and a future version each rejected with a usable
message; missing optional arrays tolerated; merge counts correct including the
all-duplicates and all-new cases.

`google-apps-script/Code.test.ts` — import preserves ids rather than generating
new ones; skips ids already present; is idempotent when the same payload is
imported twice; handles empty input; creates the target tab if absent.

## Out of scope

Scheduled or automatic backups, cloud storage, encryption, CSV export, and
selective restore of a date range. Each is additive.
