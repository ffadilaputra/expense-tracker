// Thin, typed fetch wrapper around the Apps Script API — browser fetch only,
// no HTTP client dependency. The Web App URL is whatever the user connected on
// the login screen (localStorage, see config/apiUrl.ts); each call reads it
// fresh so switching sheets takes effect immediately. This module sits outside
// the React tree, so it reads the current language via getStoredLocale()
// rather than the useI18n() hook.

import { getStoredApiUrl } from '../config/apiUrl';
import { getStoredLocale } from '../i18n/locale';
import { translate } from '../i18n/translate';
import type { ApiEnvelope, Transaction, TransactionFormData } from '../types';

function requireApiUrl(): string {
  const url = getStoredApiUrl();
  if (!url) throw new Error(translate(getStoredLocale(), 'errNotConnected'));
  return url;
}

/**
 * Coerce every field to the type our model promises. Google Sheets types cells
 * by content, so `amount` comes back as a JS number (good) but a note typed as
 * "123" could arrive as a number too. We force text fields to strings, force
 * `amount` through Number() with a NaN guard, and clamp `type` to a known value
 * so a malformed cell can never crash the list or summary.
 */
function normalizeTransaction(raw: Transaction): Transaction {
  const str = (v: unknown): string => (v == null ? '' : String(v));
  const amount = Number(raw.amount);
  return {
    id: str(raw.id),
    type: raw.type === 'income' ? 'income' : 'expense',
    amount: Number.isFinite(amount) ? amount : 0,
    category: str(raw.category),
    date: str(raw.date).slice(0, 10),
    note: raw.note == null ? '' : str(raw.note),
    createdAt: str(raw.createdAt)
  };
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

async function postAction<T>(
  action: 'add' | 'update' | 'delete',
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
    throw new Error(json.error ?? translate(getStoredLocale(), 'errActionFailed', { action }));
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
