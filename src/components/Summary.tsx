import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import type { AllDebtsSummary } from '../utils/debt';
import { currentMonth, monthName, previousMonth, type Period } from '../utils/period';

interface SummaryProps {
  /** All-time: a balance scoped to a period would be a different number. */
  balance: number;
  income: number;
  expense: number;
  period: Period;
  todayISO: string;
  /** Null when no debts exist; the card is then not rendered at all. */
  debt: AllDebtsSummary | null;
}

function Summary({ balance, income, expense, period, todayISO, debt }: SummaryProps) {
  const { t, locale } = useI18n();

  function periodName(): string {
    if (period.kind === 'date') return t('periodOnDate', { date: period.date });
    if (period.key === currentMonth(todayISO).key) return t('periodThisMonth');
    if (period.key === previousMonth(todayISO).key) return t('periodLastMonth');
    return monthName(period.key, locale);
  }

  return (
    <section className="summary" aria-label={t('balanceLabel')}>
      {/* The balance deliberately gets no card. It is the one all-time figure
          on the screen, so it sits directly on the page as a headline while the
          period-scoped figures below are boxed - that contrast is what
          separates them, rather than a size step alone. */}
      <div className="summary__hero">
        <span className="summary__label">
          {t('balanceLabel')}
          <span className="summary__scope">{t('balanceAllTime')}</span>
        </span>
        <span className="summary__amount">{formatIDR(balance)}</span>
      </div>

      {/* The caption belongs to the two cards, not to the balance above: they
          are the only figures the period applies to. */}
      <p className="summary__period">{periodName()}</p>

      <div className="summary__cards">
        <article className="stat-card stat-card--income">
          <span className="stat-card__label">
            <span className="stat-card__arrow" aria-hidden="true">
              ↑
            </span>
            {t('incomeLabel')}
          </span>
          <span className="stat-card__value">{formatIDR(income)}</span>
        </article>

        <article className="stat-card stat-card--expense">
          <span className="stat-card__label">
            <span className="stat-card__arrow" aria-hidden="true">
              ↓
            </span>
            {t('expenseLabel')}
          </span>
          <span className="stat-card__value">{formatIDR(expense)}</span>
        </article>
      </div>

      {/* Below income and expense, and full width, because it is neither: what
          is still owed is a standing position, not something this period did. */}
      {debt && debt.totalAmount > 0 && (
        <article className="debt-card">
          <span className="stat-card__label">
            {t('debtOutstanding')}
            {debt.overdueCount > 0 && (
              <span className="debt-card__overdue">
                {t('debtOverdueCount', { count: debt.overdueCount })}
              </span>
            )}
          </span>
          <span className="debt-card__value">{formatIDR(debt.remainingAmount)}</span>
          <span className="debt-card__bar" aria-hidden="true">
            <span
              className="debt-card__fill"
              style={{ width: `${Math.round(debt.paidFraction * 100)}%` }}
            />
          </span>
          <span className="debt-card__meta">
            {t('debtPaidProgress', {
              paid: formatIDR(debt.paidAmount),
              total: formatIDR(debt.totalAmount),
              percent: Math.round(debt.paidFraction * 100)
            })}
          </span>
        </article>
      )}

    </section>
  );
}

export default memo(Summary);
