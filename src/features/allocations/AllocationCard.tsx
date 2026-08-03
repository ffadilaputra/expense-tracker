import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import type { AllocationRow } from './allocations';
import './AllocationCard.css';

interface AllocationCardProps {
  row: AllocationRow;
  onOpen: () => void;
}

/**
 * Leads with `available` - the pot actually accumulated - and shows this
 * period's progress underneath. Two different questions, both worth answering:
 * what is in the pot, and how today is going.
 */
function AllocationCard({ row: { allocation, summary }, onOpen }: AllocationCardProps) {
  const { t } = useI18n();

  // Guarded because a zero amount hand-typed into the sheet would otherwise
  // divide to Infinity and land in a width style.
  const fraction =
    allocation.amount > 0
      ? Math.min(1, Math.max(0, summary.spentThisPeriod / allocation.amount))
      : 0;

  return (
    <button
      type="button"
      className={`alloc-card ${summary.isOverdrawn ? 'is-over' : ''}`}
      onClick={onOpen}
    >
      <span className="alloc-card__head">
        {allocation.icon && (
          <span className="alloc-card__icon" aria-hidden="true">
            {allocation.icon}
          </span>
        )}
        <span className="alloc-card__name">{allocation.name}</span>
      </span>

      <span className="alloc-card__amount">
        {summary.isOverdrawn
          ? t('allocationOverdrawn', { amount: formatIDR(Math.abs(summary.available)) })
          : t('allocationLeft', { amount: formatIDR(summary.available) })}
      </span>

      <span className="alloc-card__bar" aria-hidden="true">
        <span className="alloc-card__fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </span>

      <span className="alloc-card__meta">
        {t('allocationPeriodProgress', {
          spent: formatIDR(summary.spentThisPeriod),
          amount: formatIDR(allocation.amount)
        })}
      </span>
    </button>
  );
}

export default memo(AllocationCard);
