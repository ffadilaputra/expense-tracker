import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import { summarizeAllSavings } from '../utils/savings';
import type { Saving, SavingContribution } from '../types';

interface SavingsScreenProps {
  savings: Saving[];
  contributions: SavingContribution[];
  onAdd: () => void;
  onOpen: (saving: Saving) => void;
}

function SavingsScreen({ savings, contributions, onAdd, onOpen }: SavingsScreenProps) {
  const { t } = useI18n();
  const all = useMemo(() => summarizeAllSavings(savings, contributions), [savings, contributions]);

  return (
    <div className="accounts">
      <div className="accounts__head">
        <h2 className="accounts__title">{t('navSavings')}</h2>
        <button type="button" className="accounts__add" onClick={onAdd} aria-label={t('savingAddLabel')}>
          +
        </button>
      </div>

      {savings.length === 0 && <p className="txn-list__empty">{t('savingsEmpty')}</p>}

      {/* auto-fill rather than a fixed column count, so the grid answers the
          width it is given instead of needing a breakpoint per screen size. */}
      <div className="savings-grid">
        {all.rows.map(({ saving, summary }) => (
          <button
            type="button"
            className={`saving-card ${summary.isComplete ? 'is-complete' : ''}`}
            key={saving.id}
            onClick={() => onOpen(saving)}
          >
            <span className="saving-card__icon" aria-hidden="true">
              {saving.icon || '◎'}
            </span>
            <span className="saving-card__name">{saving.name}</span>

            <span className="saving-card__bar" aria-hidden="true">
              <span
                className="saving-card__fill"
                style={{ width: `${Math.round(summary.fraction * 100)}%` }}
              />
            </span>

            <span className="saving-card__figures">
              {formatIDR(summary.savedAmount)}
              <span className="saving-card__target"> / {formatIDR(saving.targetAmount)}</span>
            </span>
            <span className="saving-card__percent">
              {summary.isComplete
                ? t('savingComplete')
                : `${Math.round(summary.fraction * 100)}%`}
            </span>
          </button>
        ))}
      </div>

      {savings.length > 0 && (
        <>
          <div className="accounts__total">
            <span>{t('savingTotalSaved')}</span>
            <span>{formatIDR(all.savedAmount)}</span>
          </div>
          {/* Said plainly, because a card reading "saved" beside a balance that
              never moved invites reading savings as a separate pot. */}
          <p className="accounts__note">{t('savingEarmarkNote')}</p>
        </>
      )}
    </div>
  );
}

export default memo(SavingsScreen);
