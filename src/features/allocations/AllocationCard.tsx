import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import { intervalDays, type AllocationRow } from './allocations';
import type { TranslationKey } from '../../i18n/translations';
import './AllocationCard.css';

interface AllocationCardProps {
  row: AllocationRow;
  onOpen: () => void;
}

/** `days` is missing on purpose - it needs its interval, so it is built below. */
const CADENCE_KEYS: Record<'daily' | 'weekly' | 'monthly', TranslationKey> = {
  daily: 'allocationCadenceDaily',
  weekly: 'allocationCadenceWeekly',
  monthly: 'allocationCadenceMonthly'
};

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

  // Says what the `{amount}` in the progress line is actually per, so two cards
  // showing the same allowance are not read as the same budget.
  const cadenceLabel =
    allocation.cadence === 'days'
      ? t('allocationCadenceEvery', { count: intervalDays(allocation) })
      : t(CADENCE_KEYS[allocation.cadence]);

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

      <span className="alloc-card__cadence">{cadenceLabel}</span>
    </button>
  );
}

export default memo(AllocationCard);
