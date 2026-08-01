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
var HEADERS = ['id', 'type', 'amount', 'category', 'date', 'note', 'createdAt'];

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders(sheet);
  return sheet;
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
function ensureHeaders(sheet) {
  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }
  var first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (String(first[0]).trim().toLowerCase() === 'id') return;
  sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
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
    createdAt: String(row[6])
  };
}

function getAll(sheet) {
  var values = sheet.getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r[0] !== ''; }).map(rowToObject);
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
    new Date().toISOString()
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
    existing[6]
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

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!isOwner(params.token)) return jsonResponse({ success: false, error: 'Unauthorized' });
    var sheet = getSheet();
    var action = params.action || 'list';
    if (action === 'list') return jsonResponse({ success: true, data: getAll(sheet) });
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
    return jsonResponse({ success: false, error: 'Unknown POST action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Script error: ' + (err && err.message ? err.message : err) });
  }
}
