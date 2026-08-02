import { memo, useMemo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import { summarizeAllSavings } from './savings';
import SavingCard from './SavingCard';
import type { Saving, SavingContribution } from '../../types';
import './SavingsStrip.css';

interface SavingsStripProps {
  savings: Saving[];
  contributions: SavingContribution[];
  onOpen: (saving: Saving) => void;
}

/**
 * Goals on the transactions page, one card each.
 *
 * Laid out as a horizontal scroller rather than a grid: this page is a feed,
 * and a grid of goals would push the actual transactions further down the page
 * with every goal added. The scroller stays one row however many there are.
 */
function SavingsStrip({ savings, contributions, onOpen }: SavingsStripProps) {
  const { t } = useI18n();
  const all = useMemo(() => summarizeAllSavings(savings, contributions), [savings, contributions]);

  if (savings.length === 0) return null;

  return (
    <section className="savings-strip" aria-label={t('savingSummaryLabel')}>
      <div className="savings-strip__head">
        <h2 className="savings-strip__title">{t('savingSummaryLabel')}</h2>
        {/* The aggregate the strip replaces, kept as one line rather than a
            card of its own. */}
        <span className="savings-strip__total">
          {t('savingSetAside', { amount: formatIDR(all.savedAmount) })}
        </span>
      </div>

      <div className="savings-strip__scroll">
        <div className="savings-strip__row">
          {all.rows.map(({ saving, summary }) => (
            <SavingCard
              key={saving.id}
              saving={saving}
              summary={summary}
              onOpen={() => onOpen(saving)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default memo(SavingsStrip);
