import { memo } from 'react';
import { useI18n } from '../i18n/context';
import './SyncStatus.css';

interface SyncStatusProps {
  isOnline: boolean;
  syncing: boolean;
  pendingCount: number;
  /** A background fetch is in flight over data already on screen. */
  refreshing: boolean;
  /** Changes the sheet refused; they will not retry on their own. */
  failedCount: number;
  onSyncNow: () => void;
  onRetryFailed: () => void;
  onDiscardFailed: () => void;
}

function SyncStatus({
  isOnline,
  syncing,
  pendingCount,
  refreshing,
  failedCount,
  onSyncNow,
  onRetryFailed,
  onDiscardFailed
}: SyncStatusProps) {
  const { t } = useI18n();

  return (
    <div className="sync-status">
      <div className="sync-status__row">
        <span className={`sync-dot ${isOnline ? 'is-online' : 'is-offline'}`} />
        <span>{isOnline ? t('syncOnline') : t('syncOffline')}</span>
        {refreshing && (
          <>
            <span className="sync-status__sep">·</span>
            <span className="sync-status__refreshing">{t('refreshing')}</span>
          </>
        )}
        {pendingCount > 0 && (
          <>
            <span className="sync-status__sep">·</span>
            <span>{t('syncPendingChanges', { count: pendingCount })}</span>
            {isOnline && (
              <button className="sync-status__btn" onClick={onSyncNow} disabled={syncing}>
                {syncing ? t('syncSyncing') : t('syncNowBtn')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Refused changes never retry on their own, so the only way out is an
          explicit choice: try again, or drop them. */}
      {failedCount > 0 && (
        <div className="sync-status__row sync-status__row--failed">
          <span>{t('failedCount', { count: failedCount })}</span>
          <button className="sync-status__btn" onClick={onRetryFailed} disabled={syncing}>
            {t('failedRetry')}
          </button>
          <button className="sync-status__btn" onClick={onDiscardFailed} disabled={syncing}>
            {t('failedDiscard')}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(SyncStatus);
