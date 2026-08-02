import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import type { SpendingTrend } from './spendingTrend';
import './SpendingTrendMessage.css';

interface SpendingTrendMessageProps {
  /** null when there is no baseline to compare against — renders nothing. */
  trend: SpendingTrend | null;
}

const ARROW = { down: '↓', up: '↑', same: '=' } as const;

function SpendingTrendMessage({ trend }: SpendingTrendMessageProps) {
  const { t } = useI18n();
  if (!trend) return null;

  const text =
    trend.direction === 'same'
      ? t('trendSame')
      : t(trend.direction === 'down' ? 'trendDown' : 'trendUp', {
          amount: formatIDR(trend.difference),
          percent: trend.percent
        });

  return (
    <p className={`trend trend--${trend.direction}`} aria-label={t('trendLabel')}>
      <span className="trend__arrow" aria-hidden="true">
        {ARROW[trend.direction]}
      </span>
      {text}
    </p>
  );
}

export default memo(SpendingTrendMessage);
