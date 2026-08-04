import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { useToast } from '../../components/Toast';
import { formatIDR } from '../../utils/money';
import ReportPeriodPicker from './ReportPeriodPicker';
import TrendChart from './TrendChart';
import { buildReport } from './reportData';
import { periodSlug } from './granularity';
import { OTHER } from '../transactions/categoryBreakdown';
import { UNCATEGORIZED } from '../transactions/categoryChips';
import {
  availableMonths,
  availableYears,
  currentMonth,
  monthName,
  type Period
} from '../../utils/period';
import type { Transaction } from '../../types';
import './ReportScreen.css';

export interface ReportScreenProps {
  transactions: Transaction[];
  /** accountId -> display name, built once by AppShell. */
  accountLabels: Map<string, string>;
  todayISO: string;
}

export default function ReportScreen({
  transactions,
  accountLabels,
  todayISO
}: ReportScreenProps) {
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

  function categoryName(category: string): string {
    if (category === OTHER) return t('breakdownOther');
    if (category === UNCATEGORIZED) return t('uncategorized');
    return category;
  }

  function periodLabel(): string {
    if (period.kind === 'year') return period.year;
    if (period.kind === 'month') return monthName(period.key, locale);
    return period.date;
  }

  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  // The service worker caches lazily-loaded chunks only after they have been
  // fetched (public/sw.js is network-first with runtime caching), so a
  // first-ever export attempted offline would fail. Warming it on mount means
  // the chunk is almost always present by the time anyone taps Export.
  useEffect(() => {
    import('./pdf').catch(() => {});
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const css = getComputedStyle(document.documentElement);
      const { exportReportPdf } = await import('./pdf');
      await exportReportPdf({
        data: report,
        accountLabels,
        categoryName,
        filename: `oeank-report-${periodSlug(period)}.pdf`,
        palette: {
          categories: [0, 1, 2, 3, 4, 5].map((i) => css.getPropertyValue(`--cat-${i}`)),
          other: css.getPropertyValue('--cat-other'),
          income: css.getPropertyValue('--income'),
          expense: css.getPropertyValue('--expense')
        },
        strings: {
          appTitle: t('appTitle'),
          periodLabel: periodLabel(),
          generatedOn: t('pdfGeneratedOn', { date: todayISO }),
          income: t('incomeLabel'),
          expense: t('expenseLabel'),
          net: t('reportNetLabel'),
          trendTitle: t('reportTrendTitle'),
          byCategory: t('reportCategoryTable'),
          transactions: t('pdfTransactions'),
          colDate: t('pdfColDate'),
          colCategory: t('pdfColCategory'),
          colNote: t('pdfColNote'),
          colAccount: t('pdfColAccount'),
          colAmount: t('pdfColAmount'),
          colShare: t('pdfColShare'),
          pageOf: (page, total) => t('pdfPageOf', { page, total })
        }
      });
    } catch {
      toast.show({ message: t('reportExportFailed'), tone: 'error' });
    } finally {
      setExporting(false);
    }
    // categoryName and periodLabel close over t/locale/period, which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, accountLabels, period, locale, todayISO, t, toast]);

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
                          className={`report-table__swatch report-table__swatch--${segment.slot < 0 ? 'other' : segment.slot}`}
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

          <button
            type="button"
            className="btn btn--primary report__export"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? t('reportExporting') : t('reportExportPdf')}
          </button>
        </>
      )}
    </section>
  );
}
