import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import { currentMonth, previousMonth, type Period } from '../utils/period';

interface SummaryProps {
  /** All-time: a balance scoped to a period would be a different number. */
  balance: number;
  income: number;
  expense: number;
  period: Period;
  todayISO: string;
}

function Summary({ balance, income, expense, period, todayISO }: SummaryProps) {
  const { t } = useI18n();

  function periodName(): string {
    if (period.kind === 'date') return t('periodOnDate', { date: period.date });
    if (period.key === currentMonth(todayISO).key) return t('periodThisMonth');
    if (period.key === previousMonth(todayISO).key) return t('periodLastMonth');
    return period.key;
  }

  return (
    <section className="summary" aria-label={t('balanceLabel')}>
      <div className="summary__balance">
        <span className="summary__label">{t('balanceLabel')}</span>
        <span className="summary__amount">{formatIDR(balance)}</span>
      </div>
      <span className="summary__period">{periodName()}</span>
      <div className="summary__months">
        <div className="summary__stat summary__stat--income">
          <span className="summary__stat-label">{t('incomeLabel')}</span>
          <span className="summary__stat-value">↑ {formatIDR(income)}</span>
        </div>
        <div className="summary__stat summary__stat--expense">
          <span className="summary__stat-label">{t('expenseLabel')}</span>
          <span className="summary__stat-value">↓ {formatIDR(expense)}</span>
        </div>
      </div>
    </section>
  );
}

export default memo(Summary);
