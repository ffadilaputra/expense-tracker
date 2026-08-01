// Thin, typed fetch wrapper around the Apps Script API — browser fetch only,
// no HTTP client dependency. The Web App URL is whatever the user connected on
// the login screen (localStorage, see config/apiUrl.ts); each call reads it
// fresh so switching sheets takes effect immediately. This module sits outside
// the React tree, so it reads the current language via getStoredLocale()
// rather than the useI18n() hook.

import { getStoredApiUrl } from '../config/apiUrl';
import { getStoredLocale } from '../i18n/locale';
import { translate } from '../i18n/translate';
import { normalizeTransaction } from '../utils/normalize';
import type { ApiEnvelope, Transaction, TransactionFormData } from '../types';

function requireApiUrl(): string {
  const url = getStoredApiUrl();
  if (!url) throw new Error(translate(getStoredLocale(), 'errNotConnected'));
  return url;
}

/**
 * The server understood the request and refused it (`success: false`), as
 * opposed to the request never arriving. The distinction matters to the sync
 * queue: a refusal will be refused again on every retry, while a network
 * failure is worth retrying once the connection is back.
 */
export class ApiRejectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiRejectionError';
  }
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const apiUrl = requireApiUrl();
  const res = await fetch(`${apiUrl}?action=list`);
  const json = (await res.json()) as ApiEnvelope<Transaction[]>;
  if (!json.success || !json.data) {
    throw new Error(json.error ?? translate(getStoredLocale(), 'errFetchFailed'));
  }
  return json.data.map(normalizeTransaction);
}

export async function addTransaction(form: TransactionFormData): Promise<Transaction> {
  return normalizeTransaction(await postAction<Transaction>('add', form));
}

export async function updateTransaction(
  data: Partial<TransactionFormData> & { id: string }
): Promise<Transaction> {
  return normalizeTransaction(await postAction<Transaction>('update', data));
}

export async function deleteTransaction(id: string): Promise<void> {
  await postAction<null>('delete', { id });
}

export interface ImportCounts {
  added: number;
  skipped: number;
}

export interface ImportResult {
  transactions: ImportCounts;
  accounts: ImportCounts;
  transfers: ImportCounts;
}

/**
 * Restores a backup in one request. The sheet merges by id and reports what it
 * actually wrote, rather than the client guessing from its own copy.
 */
export async function importBackup(data: {
  transactions: unknown[];
  accounts: unknown[];
  transfers: unknown[];
}): Promise<ImportResult> {
  return postAction<ImportResult>('import', data);
}

async function postAction<T>(
  action: 'add' | 'update' | 'delete' | 'import',
  data: unknown
): Promise<T> {
  const apiUrl = requireApiUrl();
  // text/plain avoids a CORS preflight (OPTIONS), which Apps Script Web Apps
  // don't handle well. The body is still JSON text underneath.
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data })
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!json.success) {
    throw new ApiRejectionError(
      json.error ?? translate(getStoredLocale(), 'errActionFailed', { action })
    );
  }
  return json.data as T;
}

/** Used by the login screen: confirms a URL is a working deployment for this app. */
export async function verifyApiUrl(url: string): Promise<void> {
  const locale = getStoredLocale();
  let res: Response;
  try {
    res = await fetch(`${url}?action=list`);
  } catch {
    throw new Error(translate(locale, 'errVerifyNetwork'));
  }
  if (!res.ok) throw new Error(translate(locale, 'errVerifyStatus', { status: res.status }));
  const json = (await res.json()) as ApiEnvelope<Transaction[]>;
  if (!json.success) throw new Error(json.error ?? translate(locale, 'errVerifyInvalid'));
}
