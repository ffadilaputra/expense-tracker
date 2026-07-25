import { memo } from 'react';
import { useI18n } from '../i18n/context';

interface SyncStatusProps {
  isOnline: boolean;
  syncing: boolean;
  pendingCount: number;
  onSyncNow: () => void;
}

function SyncStatus({ isOnline, syncing, pendingCount, onSyncNow }: SyncStatusProps) {
  const { t } = useI18n();

  return (
    <div className="sync-status">
      <span className={`sync-dot ${isOnline ? 'is-online' : 'is-offline'}`} />
      <span>{isOnline ? t('syncOnline') : t('syncOffline')}</span>
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
  );
}

export default memo(SyncStatus);
