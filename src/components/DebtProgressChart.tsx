import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import type { AllDebtsSummary } from '../utils/debt';

interface DebtProgressChartProps {
  summary: AllDebtsSummary;
}

/**
 * Paid against remaining, one stacked bar per debt.
 *
 * Bars share a single scale - each is drawn as its share of the largest debt -
 * so a shorter bar means a smaller debt rather than one further along. Scaling
 * each bar to its own width would make every debt look the same size.
 *
 * Two classes, so this is the "one series is the point, the rest is context"
 * case rather than a categorical one: paid takes the app's single accent and
 * the remainder stays the neutral track. No new palette, nothing to validate.
 */
function DebtProgressChart({ summary }: DebtProgressChartProps) {
  const { t } = useI18n();
  if (summary.rows.length === 0) return null;

  const largest = Math.max(...summary.rows.map((r) => r.summary.paidAmount + r.summary.remainingAmount));

  return (
    <section className="debt-chart" aria-label={t('debtChartTitle')}>
      <div className="debt-chart__head">
        <h3 className="debt-chart__title">{t('debtChartTitle')}</h3>
        {/* Two series, so a legend is always present; the figures under each
            bar carry the same information for anyone not reading colour. */}
        <ul className="debt-chart__legend">
          <li>
            <span className="debt-chart__key debt-chart__key--paid" aria-hidden="true" />
            {t('debtPaidLabel')}
          </li>
          <li>
            <span className="debt-chart__key debt-chart__key--left" aria-hidden="true" />
            {t('debtLeftLabel')}
          </li>
        </ul>
      </div>

      <ul className="debt-chart__rows">
        {summary.rows.map(({ debt, summary: s }) => {
          const total = s.paidAmount + s.remainingAmount;
          const width = largest > 0 ? (total / largest) * 100 : 0;
          const paidShare = total > 0 ? (s.paidAmount / total) * 100 : 0;

          return (
            <li className="debt-chart__row" key={debt.id}>
              <span className="debt-chart__name">{debt.name}</span>
              <span
                className="debt-chart__track"
                style={{ width: `${width}%` }}
                title={`${debt.name}: ${formatIDR(s.paidAmount)} / ${formatIDR(total)}`}
              >
                <span className="debt-chart__paid" style={{ width: `${paidShare}%` }} />
              </span>
              <span className="debt-chart__figures">
                {t('debtPaidOfTotal', {
                  paid: formatIDR(s.paidAmount),
                  left: formatIDR(s.remainingAmount)
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default memo(DebtProgressChart);
