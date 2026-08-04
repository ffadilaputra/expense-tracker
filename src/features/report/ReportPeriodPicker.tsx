import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { monthName, type Period } from '../../utils/period';
import { granularityOf, switchGranularity, type Granularity } from './granularity';
import type { TranslationKey } from '../../i18n/translations';
import './ReportPeriodPicker.css';

interface ReportPeriodPickerProps {
  period: Period;
  todayISO: string;
  /** Newest first, from availableYears. */
  years: string[];
  /** Newest first, from availableMonths. */
  months: string[];
  onChange: (period: Period) => void;
}

const MODES: { key: Granularity; label: TranslationKey }[] = [
  { key: 'year', label: 'reportYear' },
  { key: 'month', label: 'reportMonth' },
  { key: 'day', label: 'reportDay' }
];

/**
 * The selected value has to be one of the options or the native control renders
 * blank, and switchGranularity can legitimately land on a month or year holding
 * no transactions of its own. Folding it in beats assuming it is there.
 */
function withSelected(options: string[], selected: string): string[] {
  return options.includes(selected)
    ? options
    : [...options, selected].sort((a, b) => b.localeCompare(a));
}

/**
 * Deliberately not PeriodBar. That control is built around this-month /
 * last-month shortcuts and an icon-only day input sized for the transactions
 * screen; the report wants a plain granularity switch. Sharing the Period type
 * is the reuse that pays - sharing the widget would mean bending one control to
 * two jobs.
 */
function ReportPeriodPicker({ period, todayISO, years, months, onChange }: ReportPeriodPickerProps) {
  const { t, locale } = useI18n();
  const active = granularityOf(period);

  return (
    <section className="report-period" role="group" aria-label={t('reportGranularityLabel')}>
      <div className="report-period__modes">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`report-period__mode ${active === key ? 'active' : ''}`}
            aria-pressed={active === key}
            onClick={() => onChange(switchGranularity(period, key, months, todayISO))}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {period.kind === 'year' && (
        <select
          className="report-period__value"
          value={period.year}
          aria-label={t('reportPickYear')}
          onChange={(e) => onChange({ kind: 'year', year: e.target.value })}
        >
          {withSelected(years, period.year).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      )}

      {period.kind === 'month' && (
        <select
          className="report-period__value"
          value={period.key}
          aria-label={t('periodPickMonth')}
          onChange={(e) => onChange({ kind: 'month', key: e.target.value })}
        >
          {withSelected(months, period.key).map((key) => (
            <option key={key} value={key}>
              {monthName(key, locale)}
            </option>
          ))}
        </select>
      )}

      {period.kind === 'date' && (
        <input
          className="report-period__value"
          type="date"
          value={period.date}
          max={todayISO}
          aria-label={t('periodPickDay')}
          // Clearing the field would leave the report with no period at all, so
          // an empty value is ignored and the current day stands.
          onChange={(e) => e.target.value && onChange({ kind: 'date', date: e.target.value })}
        />
      )}
    </section>
  );
}

export default memo(ReportPeriodPicker);
