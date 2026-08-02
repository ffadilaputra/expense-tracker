import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import type { SavingSummary } from './savings';
import type { Saving } from '../../types';
import './SavingCard.css';

interface SavingCardProps {
  saving: Saving;
  summary: SavingSummary;
  onOpen: () => void;
}

/**
 * One goal, as a card. Deliberately has no size of its own - the grid on the
 * savings screen and the strip on the transactions page lay it out, so the two
 * cannot drift into different-looking cards.
 */
function SavingCard({ saving, summary, onOpen }: SavingCardProps) {
  const { t } = useI18n();
  const percent = Math.round(summary.fraction * 100);

  return (
    <button
      type="button"
      className={`saving-card ${summary.isComplete ? 'is-complete' : ''}`}
      onClick={onOpen}
    >
      <span className="saving-card__icon" aria-hidden="true">
        {saving.icon || '◎'}
      </span>
      <span className="saving-card__name">{saving.name}</span>

      <span className="saving-card__bar" aria-hidden="true">
        <span className="saving-card__fill" style={{ width: `${percent}%` }} />
      </span>

      <span className="saving-card__figures">
        {formatIDR(summary.savedAmount)}
        <span className="saving-card__target"> / {formatIDR(saving.targetAmount)}</span>
      </span>
      <span className="saving-card__percent">
        {summary.isComplete ? t('savingComplete') : `${percent}%`}
      </span>
    </button>
  );
}

export default memo(SavingCard);
