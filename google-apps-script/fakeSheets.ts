// Minimal stand-ins for the Apps Script services Code.gs touches, enough to
// exercise it in vitest. Code.gs is plain ES5 with no imports, so it can be
// evaluated in a sandbox with these injected as globals — the alternative is
// no test coverage at all for the sheet layer.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class FakeSheet {
  rows: unknown[][];
  maxColumns: number;

  constructor(rows: unknown[][] = [], maxColumns = 26) {
    this.rows = rows.map((r) => [...r]);
    this.maxColumns = maxColumns;
  }

  getMaxColumns() {
    return this.maxColumns;
  }

  insertColumnsAfter(_after: number, count: number) {
    this.maxColumns += count;
  }

  /** Apps Script reports the last row containing content; 0 when empty. */
  getLastRow() {
    return this.rows.length;
  }

  appendRow(row: unknown[]) {
    this.rows.push([...row]);
  }

  insertRowBefore(index: number) {
    this.rows.splice(index - 1, 0, new Array(this.maxColumns).fill(''));
  }

  deleteRow(index: number) {
    this.rows.splice(index - 1, 1);
  }

  getDataRange() {
    const width = this.rows.reduce((w, r) => Math.max(w, r.length), 0);
    return {
      getValues: () =>
        this.rows.map((r) => {
          const padded = [...r];
          while (padded.length < width) padded.push('');
          return padded;
        })
    };
  }

  getRange(row: number, col: number, numRows: number, numCols: number) {
    const sheet = this;
    return {
      getValues() {
        const out: unknown[][] = [];
        for (let r = 0; r < numRows; r++) {
          const source = sheet.rows[row - 1 + r] ?? [];
          const line: unknown[] = [];
          for (let c = 0; c < numCols; c++) line.push(source[col - 1 + c] ?? '');
          out.push(line);
        }
        return out;
      },
      setValues(values: unknown[][]) {
        for (let r = 0; r < numRows; r++) {
          while (sheet.rows.length < row - 1 + r + 1) sheet.rows.push([]);
          const target = sheet.rows[row - 1 + r];
          for (let c = 0; c < numCols; c++) target[col - 1 + c] = values[r][c];
        }
      }
    };
  }
}

export interface CodeApi {
  getSheet: () => FakeSheet;
  doGet: (e: unknown) => { getContent: () => string };
  doPost: (e: unknown) => { getContent: () => string };
}

/**
 * Evaluates Code.gs with fake Apps Script globals and returns the functions
 * under test plus the spreadsheet they operate on.
 */
export function loadCode(initial?: { name?: string; sheet?: FakeSheet }): {
  api: CodeApi;
  sheets: Map<string, FakeSheet>;
} {
  const sheets = new Map<string, FakeSheet>();
  if (initial?.sheet) sheets.set(initial.name ?? 'Transactions', initial.sheet);

  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name: string) => sheets.get(name) ?? null,
      insertSheet: (name: string) => {
        const created = new FakeSheet();
        sheets.set(name, created);
        return created;
      }
    })
  };

  let uuidCounter = 0;
  const Utilities = { getUuid: () => `uuid-${++uuidCounter}` };
  const PropertiesService = {
    getScriptProperties: () => ({ getProperty: () => null })
  };
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text: string) => ({
      setMimeType: () => ({ getContent: () => text })
    })
  };

  const source = readFileSync(join(__dirname, 'Code.gs'), 'utf8');
  const factory = new Function(
    'SpreadsheetApp',
    'Utilities',
    'PropertiesService',
    'ContentService',
    `${source}\nreturn { getSheet: getSheet, doGet: doGet, doPost: doPost };`
  );

  return {
    api: factory(SpreadsheetApp, Utilities, PropertiesService, ContentService) as CodeApi,
    sheets
  };
}

export function post(api: CodeApi, action: string, data: unknown) {
  const out = api.doPost({ postData: { contents: JSON.stringify({ action, data }) } });
  return JSON.parse(out.getContent());
}

export function get(api: CodeApi, action: string) {
  const out = api.doGet({ parameter: { action } });
  return JSON.parse(out.getContent());
}
