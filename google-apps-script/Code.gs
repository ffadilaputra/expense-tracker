/**
 * UANG — Personal Finance — Google Apps Script API
 * -------------------------------------------------
 * Paste into Extensions > Apps Script on your Google Sheet, then
 * Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 *
 * Sheet tab name: "Transactions". Columns (row 1 = header):
 *   id | type | amount | category | date | note | createdAt
 *
 * SECURITY: the Web App URL can add/edit/DELETE rows. If you will share the
 * URL, set a token: Project Settings > Script Properties > OWNER_TOKEN = <random>.
 * When set, every action requires that token; when unset the script is open
 * (fine for a URL only you hold).
 */

var SHEET_NAME = 'Transactions';
var HEADERS = ['id', 'type', 'amount', 'category', 'date', 'note', 'createdAt', 'accountId'];

// Written to only by the backup import for now; the accounts feature will use
// these same tabs. Neither is created unless there are rows to put in it, so a
// user who never imports accounts never grows an empty tab.
var ACCOUNTS_SHEET = 'Accounts';
var ACCOUNT_HEADERS = ['id', 'name', 'ownerName', 'icon', 'createdAt'];
var TRANSFERS_SHEET = 'Transfers';
var TRANSFER_HEADERS = ['id', 'fromAccountId', 'toAccountId', 'amount', 'date', 'note', 'createdAt'];

function getSheetFor(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  ensureHeaders(sheet, headers);
  return sheet;
}

function getSheet() {
  return getSheetFor(SHEET_NAME, HEADERS);
}

/**
 * Guarantees row 1 is the header row, on every request rather than only when
 * this script creates the tab. A tab the user made by hand (which the setup
 * instructions ask for) reaches here with no header at all, and everything
 * below assumes there is one: getAll slices row 1 off, and findRowIndexById
 * starts scanning at row 2. Without a header the first transaction is written
 * into row 1, where it can never be listed, updated or deleted - the row is
 * visible in the sheet but invisible to the API.
 *
 * When row 1 already holds a transaction (a sheet damaged by an earlier
 * version of this script), inserting the header above it moves that row to 2
 * and brings it back into reach instead of discarding it.
 */
function ensureHeaders(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];

  // No header at all: the first transaction was written into row 1, where
  // getAll sliced it away and findRowIndexById never scanned it. Insert the
  // header above so that row moves to 2 and comes back into reach.
  if (String(first[0]).trim().toLowerCase() !== 'id') {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  // Header present but short - a sheet written by an older version of this
  // script, before a column was added. Fill in only the cells that differ, so
  // a live sheet gains the new column without any data row being touched.
  var missing = false;
  for (var i = 0; i < headers.length; i++) {
    if (String(first[i]).trim() !== headers[i]) {
      missing = true;
      break;
    }
  }
  if (missing) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ownerToken() {
  return PropertiesService.getScriptProperties().getProperty('OWNER_TOKEN') || '';
}
function isOwner(provided) {
  var expected = ownerToken();
  return expected === '' || provided === expected;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normType(v) { return String(v) === 'income' ? 'income' : 'expense'; }
function normAmount(v) { var n = Number(v); return isNaN(n) ? 0 : Math.round(n); }
function normDate(v) {
  if (v instanceof Date) {
    // Sheets may auto-parse a yyyy-mm-dd cell into a Date; render back to ISO date.
    var y = v.getFullYear(), m = ('0' + (v.getMonth() + 1)).slice(-2), d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return String(v).slice(0, 10);
}

function rowToObject(row) {
  return {
    id: String(row[0]),
    type: normType(row[1]),
    amount: normAmount(row[2]),
    category: String(row[3]),
    date: normDate(row[4]),
    note: String(row[5]),
    createdAt: String(row[6]),
    // Appended after createdAt, so rows written before accounts existed are
    // simply short here and read as unassigned.
    accountId: String(row[7] == null ? '' : row[7])
  };
}

function accountRowToObject(row) {
  return {
    id: String(row[0]),
    name: String(row[1]),
    ownerName: String(row[2] == null ? '' : row[2]),
    icon: String(row[3] == null ? '' : row[3]),
    createdAt: String(row[4] == null ? '' : row[4])
  };
}

function transferRowToObject(row) {
  return {
    id: String(row[0]),
    fromAccountId: String(row[1]),
    toAccountId: String(row[2]),
    amount: normAmount(row[3]),
    date: normDate(row[4]),
    note: String(row[5] == null ? '' : row[5]),
    createdAt: String(row[6] == null ? '' : row[6])
  };
}

function getAll(sheet) {
  var values = sheet.getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r[0] !== ''; }).map(rowToObject);
}

/**
 * Reads a tab without creating it. A user who never opens the accounts screen
 * should not grow empty Accounts and Transfers tabs just by loading the app.
 */
function readTab(name, headers, mapper) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return [];
  ensureHeaders(sheet, headers);
  var values = sheet.getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r[0] !== ''; }).map(mapper);
}

function listAll() {
  return {
    transactions: getAll(getSheet()),
    accounts: readTab(ACCOUNTS_SHEET, ACCOUNT_HEADERS, accountRowToObject),
    transfers: readTab(TRANSFERS_SHEET, TRANSFER_HEADERS, transferRowToObject)
  };
}

function addAccount(data) {
  var sheet = getSheetFor(ACCOUNTS_SHEET, ACCOUNT_HEADERS);
  var row = [
    Utilities.getUuid(),
    data.name || '',
    data.ownerName || '',
    data.icon || '',
    new Date().toISOString()
  ];
  sheet.appendRow(row);
  return { success: true, data: accountRowToObject(row) };
}

function updateAccount(data) {
  var sheet = getSheetFor(ACCOUNTS_SHEET, ACCOUNT_HEADERS);
  var rowIndex = findRowIndexById(sheet, data.id);
  if (rowIndex === -1) return { success: false, error: 'Account not found' };
  var existing = sheet.getRange(rowIndex, 1, 1, ACCOUNT_HEADERS.length).getValues()[0];
  var updated = [
    existing[0],
    data.name != null ? data.name : existing[1],
    data.ownerName != null ? data.ownerName : existing[2],
    data.icon != null ? data.icon : existing[3],
    existing[4]
  ];
  sheet.getRange(rowIndex, 1, 1, ACCOUNT_HEADERS.length).setValues([updated]);
  return { success: true, data: accountRowToObject(updated) };
}

/** How many rows still point at this account, across both referencing tabs. */
function countAccountUses(id) {
  var uses = 0;
  var txns = getAll(getSheet());
  for (var i = 0; i < txns.length; i++) {
    if (txns[i].accountId === String(id)) uses++;
  }
  var transfers = readTab(TRANSFERS_SHEET, TRANSFER_HEADERS, transferRowToObject);
  for (var j = 0; j < transfers.length; j++) {
    if (transfers[j].fromAccountId === String(id) || transfers[j].toAccountId === String(id)) uses++;
  }
  return uses;
}

function addTransfer(data) {
  var from = String(data.fromAccountId || '');
  var to = String(data.toAccountId || '');
  if (from === '' || to === '') return { success: false, error: 'Both accounts are required' };
  // A transfer to itself nets to zero on both ends - it would record activity
  // that changes nothing, so it is refused rather than stored.
  if (from === to) return { success: false, error: 'Cannot transfer to the same account' };
  if (normAmount(data.amount) <= 0) return { success: false, error: 'Amount must be greater than zero' };

  var sheet = getSheetFor(TRANSFERS_SHEET, TRANSFER_HEADERS);
  var row = [
    Utilities.getUuid(),
    from,
    to,
    normAmount(data.amount),
    normDate(data.date || new Date()),
    data.note || '',
    new Date().toISOString()
  ];
  sheet.appendRow(row);
  return { success: true, data: transferRowToObject(row) };
}

function deleteTransfer(id) {
  var sheet = getSheetFor(TRANSFERS_SHEET, TRANSFER_HEADERS);
  var rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) return { success: false, error: 'Transfer not found' };
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function deleteAccount(id) {
  var sheet = getSheetFor(ACCOUNTS_SHEET, ACCOUNT_HEADERS);
  var rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) return { success: false, error: 'Account not found' };

  // Refuse rather than silently unassigning: quietly rewriting financial
  // records is worse than making the user reassign them first.
  var uses = countAccountUses(id);
  if (uses > 0) {
    return { success: false, error: 'Account still used by ' + uses + ' row(s)', data: { uses: uses } };
  }

  sheet.deleteRow(rowIndex);
  return { success: true };
}

function findRowIndexById(sheet, id) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function addTransaction(sheet, data) {
  var id = Utilities.getUuid();
  var row = [
    id,
    normType(data.type),
    normAmount(data.amount),
    data.category || '',
    normDate(data.date || new Date()),
    data.note || '',
    new Date().toISOString(),
    data.accountId || ''
  ];
  sheet.appendRow(row);
  return { success: true, data: rowToObject(row) };
}

function updateTransaction(sheet, data) {
  var rowIndex = findRowIndexById(sheet, data.id);
  if (rowIndex === -1) return { success: false, error: 'Transaction not found' };
  var existing = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  var updated = [
    existing[0],
    data.type != null ? normType(data.type) : existing[1],
    data.amount != null ? normAmount(data.amount) : existing[2],
    data.category != null ? data.category : existing[3],
    data.date != null ? normDate(data.date) : existing[4],
    data.note != null ? data.note : existing[5],
    existing[6],
    data.accountId != null ? data.accountId : existing[7]
  ];
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([updated]);
  return { success: true, data: rowToObject(updated) };
}

function deleteTransaction(sheet, id) {
  var rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) return { success: false, error: 'Transaction not found' };
  sheet.deleteRow(rowIndex);
  return { success: true };
}

/**
 * Merge by id: rows whose id is already in the tab are skipped, the rest are
 * appended keeping the id they arrive with. Preserving ids is the whole point -
 * the add action mints a fresh UUID, so importing through it would renumber
 * every row and re-importing the same file would duplicate instead of skip.
 *
 * All new rows go in one setValues rather than a call per row; a restore can
 * carry thousands and Apps Script charges per call, not per cell.
 */
function importRows(sheet, headers, rows, toRow) {
  var seen = {};
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) seen[String(values[i][0])] = true;

  var pending = [];
  var skipped = 0;
  for (var j = 0; j < rows.length; j++) {
    var id = String((rows[j] && rows[j].id) || '');
    if (id === '' || seen[id]) {
      skipped++;
      continue;
    }
    seen[id] = true;
    pending.push(toRow(rows[j], id));
  }

  if (pending.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, pending.length, headers.length).setValues(pending);
  }
  return { added: pending.length, skipped: skipped };
}

function transactionToRow(d, id) {
  return [
    id,
    normType(d.type),
    normAmount(d.amount),
    d.category || '',
    normDate(d.date || new Date()),
    d.note || '',
    d.createdAt || new Date().toISOString(),
    d.accountId || ''
  ];
}

function accountToRow(d, id) {
  return [id, d.name || '', d.ownerName || '', d.icon || '', d.createdAt || new Date().toISOString()];
}

function transferToRow(d, id) {
  return [
    id,
    d.fromAccountId || '',
    d.toAccountId || '',
    normAmount(d.amount),
    normDate(d.date || new Date()),
    d.note || '',
    d.createdAt || new Date().toISOString()
  ];
}

/** Empty collections never touch their tab, so unused ones are never created. */
function importInto(name, headers, rows, toRow) {
  if (!rows || rows.length === 0) return { added: 0, skipped: 0 };
  return importRows(getSheetFor(name, headers), headers, rows, toRow);
}

function importData(data) {
  return {
    success: true,
    data: {
      transactions: importInto(SHEET_NAME, HEADERS, data.transactions, transactionToRow),
      accounts: importInto(ACCOUNTS_SHEET, ACCOUNT_HEADERS, data.accounts, accountToRow),
      transfers: importInto(TRANSFERS_SHEET, TRANSFER_HEADERS, data.transfers, transferToRow)
    }
  };
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!isOwner(params.token)) return jsonResponse({ success: false, error: 'Unauthorized' });
    var sheet = getSheet();
    var action = params.action || 'list';
    if (action === 'list') return jsonResponse({ success: true, data: listAll() });
    return jsonResponse({ success: false, error: 'Unknown GET action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Script error: ' + (err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body;
    try { body = JSON.parse(e && e.postData ? e.postData.contents : ''); }
    catch (parseErr) { return jsonResponse({ success: false, error: 'Request body is not valid JSON' }); }
    if (!isOwner(body.token)) return jsonResponse({ success: false, error: 'Unauthorized' });
    var action = body.action;
    var data = body.data || {};
    if (action === 'ping') return jsonResponse({ success: true, data: null });
    var sheet = getSheet();
    if (action === 'add') return jsonResponse(addTransaction(sheet, data));
    if (action === 'update') return jsonResponse(updateTransaction(sheet, data));
    if (action === 'delete') return jsonResponse(deleteTransaction(sheet, data.id));
    if (action === 'import') return jsonResponse(importData(data));
    if (action === 'addAccount') return jsonResponse(addAccount(data));
    if (action === 'updateAccount') return jsonResponse(updateAccount(data));
    if (action === 'deleteAccount') return jsonResponse(deleteAccount(data.id));
    if (action === 'addTransfer') return jsonResponse(addTransfer(data));
    if (action === 'deleteTransfer') return jsonResponse(deleteTransfer(data.id));
    return jsonResponse({ success: false, error: 'Unknown POST action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Script error: ' + (err && err.message ? err.message : err) });
  }
}
