import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { computeBalance, computeMonthTotals } from '../utils/summary';
import { formatIDR } from '../utils/money';
import type { Transaction } from '../types';

interface SummaryProps {
  transactions: Transaction[];
  todayISO: string;
}

function Summary({ transactions, todayISO }: SummaryProps) {
  const { t } = useI18n();
  const balance = computeBalance(transactions);
  const { income, expense } = computeMonthTotals(transactions, todayISO);

  return (
    <section className="summary" aria-label={t('balanceLabel')}>
      <div className="summary__balance">
        <span className="summary__label">{t('balanceLabel')}</span>
        <span className="summary__amount">{formatIDR(balance)}</span>
      </div>
      <div className="summary__months">
        <div className="summary__stat summary__stat--income">
          <span className="summary__stat-label">{t('monthIncomeLabel')}</span>
          <span className="summary__stat-value">↑ {formatIDR(income)}</span>
        </div>
        <div className="summary__stat summary__stat--expense">
          <span className="summary__stat-label">{t('monthExpenseLabel')}</span>
          <span className="summary__stat-value">↓ {formatIDR(expense)}</span>
        </div>
      </div>
    </section>
  );
}

export default memo(Summary);
