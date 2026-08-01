// Thin, typed fetch wrapper around the Apps Script API — browser fetch only,
// no HTTP client dependency. The Web App URL is whatever the user connected on
// the login screen (localStorage, see config/apiUrl.ts); each call reads it
// fresh so switching sheets takes effect immediately. This module sits outside
// the React tree, so it reads the current language via getStoredLocale()
// rather than the useI18n() hook.

import { getStoredApiUrl } from '../config/apiUrl';
import { getStoredLocale } from '../i18n/locale';
import { translate } from '../i18n/translate';
import {
  normalizeAccount,
  normalizeDebt,
  normalizeInstalment,
  normalizeContribution,
  normalizeSaving,
  normalizeTransaction,
  normalizeTransfer
} from '../utils/normalize';
import type {
  Account,
  ApiEnvelope,
  Debt,
  DebtInstalment,
  Saving,
  SavingContribution,
  Transaction,
  TransactionFormData,
  Transfer
} from '../types';

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

export interface SheetSnapshot {
  transactions: Transaction[];
  accounts: Account[];
  transfers: Transfer[];
  debts: Debt[];
  debtInstalments: DebtInstalment[];
  savings: Saving[];
  savingContributions: SavingContribution[];
}

interface RawSnapshot {
  transactions?: unknown[];
  accounts?: unknown[];
  transfers?: unknown[];
  debts?: unknown[];
  debtInstalments?: unknown[];
  savings?: unknown[];
  savingContributions?: unknown[];
}

/**
 * One round trip for all three collections. A deployment that predates
 * accounts answers with a bare transaction array; that shape is accepted and
 * degrades to transactions-only rather than failing outright, so the app keeps
 * working until the user redeploys the script.
 */
export async function fetchAll(): Promise<SheetSnapshot> {
  const apiUrl = requireApiUrl();
  const res = await fetch(`${apiUrl}?action=list`);
  const json = (await res.json()) as ApiEnvelope<unknown[] | RawSnapshot>;
  if (!json.success || !json.data) {
    throw new Error(json.error ?? translate(getStoredLocale(), 'errFetchFailed'));
  }

  const raw: RawSnapshot = Array.isArray(json.data) ? { transactions: json.data } : json.data;
  return {
    transactions: (raw.transactions ?? []).map((r) => normalizeTransaction(r as Partial<Transaction>)),
    accounts: (raw.accounts ?? []).map((r) => normalizeAccount(r as Partial<Account>)),
    transfers: (raw.transfers ?? []).map((r) => normalizeTransfer(r as Partial<Transfer>)),
    debts: (raw.debts ?? []).map((r) => normalizeDebt(r as Partial<Debt>)),
    debtInstalments: (raw.debtInstalments ?? []).map((r) =>
      normalizeInstalment(r as Partial<DebtInstalment>)
    ),
    savings: (raw.savings ?? []).map((r) => normalizeSaving(r as Partial<Saving>)),
    savingContributions: (raw.savingContributions ?? []).map((r) =>
      normalizeContribution(r as Partial<SavingContribution>)
    )
  };
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

export type AccountFormData = Pick<Account, 'name' | 'ownerName' | 'icon'>;

export async function addAccount(form: AccountFormData): Promise<Account> {
  return normalizeAccount(await postAction<Account>('addAccount', form));
}

export async function updateAccount(
  data: Partial<AccountFormData> & { id: string }
): Promise<Account> {
  return normalizeAccount(await postAction<Account>('updateAccount', data));
}

export async function deleteAccount(id: string): Promise<void> {
  await postAction<null>('deleteAccount', { id });
}

export type TransferFormData = Pick<
  Transfer,
  'fromAccountId' | 'toAccountId' | 'amount' | 'date' | 'note'
>;

export async function addTransfer(form: TransferFormData): Promise<Transfer> {
  return normalizeTransfer(await postAction<Transfer>('addTransfer', form));
}

export async function deleteTransfer(id: string): Promise<void> {
  await postAction<null>('deleteTransfer', { id });
}

export type DebtFormData = Pick<
  Debt,
  'name' | 'totalAmount' | 'instalmentCount' | 'firstDueDate' | 'note'
>;

export async function addDebt(form: DebtFormData): Promise<Debt> {
  return normalizeDebt(await postAction<Debt>('addDebt', form));
}

export async function updateDebt(data: Partial<DebtFormData> & { id: string }): Promise<Debt> {
  return normalizeDebt(await postAction<Debt>('updateDebt', data));
}

export async function deleteDebt(id: string): Promise<void> {
  await postAction<null>('deleteDebt', { id });
}

export type InstalmentSaveData = Omit<DebtInstalment, 'createdAt' | '_pending'>;

/** Upserts on (debtId, number); the sheet owns that uniqueness. */
export async function saveInstalment(data: InstalmentSaveData): Promise<DebtInstalment> {
  return normalizeInstalment(await postAction<DebtInstalment>('saveInstalment', data));
}

export async function deleteInstalment(id: string): Promise<void> {
  await postAction<null>('deleteInstalment', { id });
}

export type SavingFormData = Pick<Saving, 'name' | 'icon' | 'targetAmount' | 'note'>;

export async function addSaving(form: SavingFormData): Promise<Saving> {
  return normalizeSaving(await postAction<Saving>('addSaving', form));
}

export async function updateSaving(data: Partial<SavingFormData> & { id: string }): Promise<Saving> {
  return normalizeSaving(await postAction<Saving>('updateSaving', data));
}

export async function deleteSaving(id: string): Promise<void> {
  await postAction<null>('deleteSaving', { id });
}

export type ContributionFormData = Omit<SavingContribution, 'createdAt' | '_pending'>;

export async function addContribution(form: ContributionFormData): Promise<SavingContribution> {
  return normalizeContribution(await postAction<SavingContribution>('addContribution', form));
}

export async function deleteContribution(id: string): Promise<void> {
  await postAction<null>('deleteContribution', { id });
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
  action:
    | 'add'
    | 'update'
    | 'delete'
    | 'import'
    | 'addAccount'
    | 'updateAccount'
    | 'deleteAccount'
    | 'addTransfer'
    | 'deleteTransfer'
    | 'addDebt'
    | 'updateDebt'
    | 'deleteDebt'
    | 'saveInstalment'
    | 'deleteInstalment'
    | 'addSaving'
    | 'updateSaving'
    | 'deleteSaving'
    | 'addContribution'
    | 'deleteContribution',
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
