import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { currentMonth, monthKey, monthName, previousMonth, type Period } from '../../utils/period';
import './PeriodBar.css';

interface PeriodBarProps {
  period: Period;
  todayISO: string;
  /** Month keys the user can navigate to, newest first. */
  months: string[];
  onChange: (period: Period) => void;
}

function PeriodBar({ period, todayISO, months, onChange }: PeriodBarProps) {
  const { t, locale } = useI18n();
  const thisMonth = currentMonth(todayISO);
  const lastMonth = previousMonth(todayISO);

  const isThisMonth = period.kind === 'month' && period.key === thisMonth.key;
  const isLastMonth = period.kind === 'month' && period.key === lastMonth.key;

  // When a single day is selected from the heatmap, the dropdown shows that
  // day's month rather than going blank - the month is still the context the
  // day sits in, and reopening the list starts somewhere sensible.
  const selectedMonth = period.kind === 'month' ? period.key : monthKey(period.date);

  // Any month reachable from the dropdown, even one with no transactions of its
  // own, so the two buttons never point at something the list cannot show.
  const options = [...new Set([...months, thisMonth.key, lastMonth.key])].sort((a, b) =>
    b.localeCompare(a)
  );

  return (
    <section className="period-bar" role="group" aria-label={t('periodBarLabel')}>
      <button
        type="button"
        className={`period-bar__btn ${isLastMonth ? 'active' : ''}`}
        aria-pressed={isLastMonth}
        onClick={() => onChange(lastMonth)}
      >
        {t('periodLastMonth')}
      </button>
      <button
        type="button"
        className={`period-bar__btn ${isThisMonth ? 'active' : ''}`}
        aria-pressed={isThisMonth}
        onClick={() => onChange(thisMonth)}
      >
        {t('periodThisMonth')}
      </button>

      <select
        className="period-bar__month"
        value={selectedMonth}
        aria-label={t('periodPickMonth')}
        onChange={(e) => onChange({ kind: 'month', key: e.target.value })}
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {monthName(key, locale)}
          </option>
        ))}
      </select>
    </section>
  );
}

export default memo(PeriodBar);
