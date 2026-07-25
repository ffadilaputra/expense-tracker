import { useI18n } from '../i18n/context';
import type { PullToRefreshState } from '../hooks/usePullToRefresh';

/**
 * The spinner/arrow that follows the finger during a pull-to-refresh.
 *
 * Rendered inside the normal document flow rather than fixed-position, so it
 * pushes the content down the way native pull-to-refresh does instead of
 * floating over it.
 */
export default function PullToRefreshIndicator({
  pullDistance,
  refreshing,
  willRefresh
}: PullToRefreshState) {
  const { t } = useI18n();

  // Nothing to show when idle - keeps it out of the a11y tree entirely.
  if (pullDistance === 0 && !refreshing) return null;

  const label = refreshing
    ? t('refreshing')
    : willRefresh
      ? t('releaseToRefresh')
      : t('pullToRefresh');

  // While refreshing the finger is gone, so the indicator holds a fixed
  // height instead of following pullDistance (which is already back to 0).
  const height = refreshing ? 48 : pullDistance;

  return (
    <div
      className="ptr"
      style={{ height }}
      role="status"
      aria-live="polite"
      // The height is driven by touch position, so a transition would make
      // it lag the finger. Only the settle back to 0 is animated (see CSS).
      data-refreshing={refreshing ? 'true' : undefined}
    >
      <span
        className={`ptr__spinner ${refreshing ? 'is-spinning' : ''}`}
        style={
          refreshing
            ? undefined
            : // Rotates progressively as the user pulls, reaching a half turn
              // right as the release threshold is met.
              { transform: `rotate(${Math.min(180, (pullDistance / 70) * 180)}deg)` }
        }
        aria-hidden="true"
      >
        ↓
      </span>
      <span className="ptr__label">{label}</span>
    </div>
  );
}
