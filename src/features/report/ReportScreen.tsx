import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import ReportPeriodPicker from './ReportPeriodPicker';
import TrendChart from './TrendChart';
import SpendingDoughnut from '../transactions/SpendingDoughnut';
import { buildReport } from './reportData';
import { OTHER } from '../transactions/categoryBreakdown';
import { UNCATEGORIZED } from '../transactions/categoryChips';
import {
  availableMonths,
  availableYears,
  currentMonth,
  filterByPeriod,
  type Period
} from '../../utils/period';
import type { Transaction } from '../../types';
import './ReportScreen.css';

export interface ReportScreenProps {
  transactions: Transaction[];
  todayISO: string;
}

export default function ReportScreen({ transactions, todayISO }: ReportScreenProps) {
  const { t, locale } = useI18n();
  // Opens on the current month rather than the current year: it is the scope
  // the rest of the app defaults to, so the two screens agree on first sight.
  const [period, setPeriod] = useState<Period>(() => currentMonth(todayISO));

  const years = useMemo(() => availableYears(transactions, todayISO), [transactions, todayISO]);
  const months = useMemo(() => availableMonths(transactions, todayISO), [transactions, todayISO]);
  const report = useMemo(
    () => buildReport(transactions, period, locale),
    [transactions, period, locale]
  );

  // The doughnut takes raw transactions and runs buildBreakdown itself, so it
  // gets the scoped list rather than report.breakdown.
  const scoped = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);

  function categoryName(category: string): string {
    if (category === OTHER) return t('breakdownOther');
    if (category === UNCATEGORIZED) return t('uncategorized');
    return category;
  }

  const empty = report.rows.length === 0;

  return (
    <section className="report">
      <ReportPeriodPicker
        period={period}
        todayISO={todayISO}
        years={years}
        months={months}
        onChange={setPeriod}
      />

      <div className="report-totals">
        <article className="report-totals__cell">
          <span className="report-totals__label">{t('incomeLabel')}</span>
          <span className="report-totals__value report-totals__value--income">
            {formatIDR(report.totals.income)}
          </span>
        </article>
        <article className="report-totals__cell">
          <span className="report-totals__label">{t('expenseLabel')}</span>
          <span className="report-totals__value report-totals__value--expense">
            {formatIDR(report.totals.expense)}
          </span>
        </article>
        <article className="report-totals__cell">
          <span className="report-totals__label">{t('reportNetLabel')}</span>
          <span className={`report-totals__value ${report.totals.net < 0 ? 'is-negative' : ''}`}>
            {formatIDR(report.totals.net)}
          </span>
        </article>
      </div>

      {empty ? (
        <p className="txn-list__empty">{t('reportEmpty')}</p>
      ) : (
        <>
          {report.buckets.length > 0 && <TrendChart buckets={report.buckets} />}

          <SpendingDoughnut transactions={scoped} />

          {report.breakdown.segments.length > 0 && (
            <section className="report-table" aria-label={t('reportCategoryTable')}>
              <h2 className="report-table__title">{t('reportCategoryTable')}</h2>
              <table className="report-table__grid">
                <thead>
                  <tr>
                    <th scope="col">{t('pdfColCategory')}</th>
                    <th scope="col">{t('pdfColAmount')}</th>
                    <th scope="col">{t('pdfColShare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.breakdown.segments.map((segment) => (
                    <tr key={segment.category}>
                      <td>
                        <span
                          className={`report-table__swatch doughnut__swatch--${segment.slot < 0 ? 'other' : segment.slot}`}
                          aria-hidden="true"
                        />
                        {categoryName(segment.category)}
                      </td>
                      <td className="report-table__num">{formatIDR(segment.amount)}</td>
                      <td className="report-table__num">{Math.round(segment.fraction * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </section>
  );
}
