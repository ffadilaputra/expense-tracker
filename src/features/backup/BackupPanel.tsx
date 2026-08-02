import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { useI18n } from '../../i18n/context';
import { useToast } from '../../components/Toast';
import * as sheetApi from '../../api/sheetApi';
import { buildBackup, parseBackup, summarizeRestore, type BackupFile } from './backup';
import type { Account, Transaction, Transfer } from '../../types';
import type { TranslationKey } from '../../i18n/translations';
import './BackupPanel.css';

interface BackupPanelProps {
  transactions: Transaction[];
  accounts: Account[];
  transfers: Transfer[];
  isOnline: boolean;
  onClose: () => void;
  /** Pull the authoritative copy back down once the sheet has been written. */
  onRestored: () => Promise<void>;
}

const PARSE_ERROR_KEYS: Record<string, TranslationKey> = {
  notJson: 'backupErrNotJson',
  notBackup: 'backupErrNotBackup',
  tooNew: 'backupErrTooNew',
  malformed: 'backupErrMalformed'
};

interface Staged {
  fileName: string;
  file: BackupFile;
  transactions: { added: number; skipped: number };
  accounts: { added: number; skipped: number };
  transfers: { added: number; skipped: number };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BackupPanel({
  transactions,
  accounts,
  transfers,
  isOnline,
  onClose,
  onRestored
}: BackupPanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleExport = useCallback(() => {
    const backup = buildBackup(transactions, accounts, transfers);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `uang-backup-${todayISO()}.json`;
    anchor.click();
    // Revoking immediately can cancel the download in some browsers; one tick
    // is enough for the click to have been handled.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [transactions, accounts, transfers]);

  const handleFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Clear straight away so picking the same file twice still fires onChange.
      event.target.value = '';
      if (!file) return;

      const result = parseBackup(await file.text());
      if (!result.ok) {
        setStaged(null);
        toast.show({ message: t(PARSE_ERROR_KEYS[result.error] ?? 'backupErrMalformed'), tone: 'error' });
        return;
      }

      setStaged({
        fileName: file.name,
        file: result.data,
        transactions: summarizeRestore(transactions, result.data.transactions),
        accounts: summarizeRestore(accounts, result.data.accounts),
        transfers: summarizeRestore(transfers, result.data.transfers)
      });
    },
    [transactions, accounts, transfers, toast, t]
  );

  const handleRestore = useCallback(async () => {
    if (!staged) return;
    setRestoring(true);
    try {
      const counts = await sheetApi.importBackup({
        transactions: staged.file.transactions,
        accounts: staged.file.accounts,
        transfers: staged.file.transfers
      });
      await onRestored();

      const added = counts.transactions.added + counts.accounts.added + counts.transfers.added;
      const skipped = counts.transactions.skipped + counts.accounts.skipped + counts.transfers.skipped;
      toast.show({ message: t('backupDone', { added, skipped }) });
      setStaged(null);
      onClose();
    } catch (err) {
      toast.show({ message: t('backupErrFailed', { reason: (err as Error).message }), tone: 'error', sticky: true });
    } finally {
      setRestoring(false);
    }
  }, [staged, onRestored, onClose, toast, t]);

  const totalToAdd = staged
    ? staged.transactions.added + staged.accounts.added + staged.transfers.added
    : 0;

  return (
    <div className="backup">
      <section className="backup__section">
        <h3 className="backup__heading">{t('backupExportHeading')}</h3>
        <p className="backup__help">{t('backupExportHelp')}</p>
        <button type="button" className="btn btn--primary" onClick={handleExport}>
          {t('backupExportBtn')}
        </button>
      </section>

      <section className="backup__section">
        <h3 className="backup__heading">{t('backupRestoreHeading')}</h3>
        <p className="backup__help">{t('backupRestoreHelp')}</p>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="backup__file"
          onChange={handleFile}
        />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={restoring}
        >
          {t('backupChooseFile')}
        </button>

        {staged && (
          <div className="backup__preview">
            <p className="backup__filename">{staged.fileName}</p>
            <ul className="backup__counts">
              <li>
                {t('backupCountTransactions', {
                  total: staged.file.transactions.length,
                  added: staged.transactions.added,
                  skipped: staged.transactions.skipped
                })}
              </li>
              {staged.file.accounts.length > 0 && (
                <li>
                  {t('backupCountAccounts', {
                    total: staged.file.accounts.length,
                    added: staged.accounts.added,
                    skipped: staged.accounts.skipped
                  })}
                </li>
              )}
              {staged.file.transfers.length > 0 && (
                <li>
                  {t('backupCountTransfers', {
                    total: staged.file.transfers.length,
                    added: staged.transfers.added,
                    skipped: staged.transfers.skipped
                  })}
                </li>
              )}
            </ul>

            {totalToAdd === 0 && <p className="backup__help">{t('backupNothingToAdd')}</p>}
            {!isOnline && <p className="backup__warn">{t('backupOfflineNote')}</p>}

            <button
              type="button"
              className="btn btn--primary"
              onClick={handleRestore}
              disabled={restoring || !isOnline || totalToAdd === 0}
            >
              {restoring ? t('backupRestoring') : t('backupRestoreBtn')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
