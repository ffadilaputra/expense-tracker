import { memo, useRef } from 'react';
import { useI18n } from '../../i18n/context';
import Icon from '../../components/Icon';
import {
  currentMonth,
  monthKey,
  monthName,
  previousMonth,
  type MonthOrDatePeriod
} from '../../utils/period';
import './PeriodBar.css';

interface PeriodBarProps {
  period: MonthOrDatePeriod;
  todayISO: string;
  /** Month keys the user can navigate to, newest first. */
  months: string[];
  onChange: (period: MonthOrDatePeriod) => void;
}

function PeriodBar({ period, todayISO, months, onChange }: PeriodBarProps) {
  const { t, locale } = useI18n();
  const dayRef = useRef<HTMLInputElement>(null);
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

      {/* Day selection, and the only route to it now that the heatmap sits
          inside a collapsed panel.

          Icon only: the chosen day is already spelled out on the summary card
          just below, so a control repeating it in dd/mm/yyyy earns none of the
          width it costs in this row. The native input is stretched over the
          icon at zero opacity, and the click opens the platform picker through
          showPicker() - a bare date input only opens from its own indicator,
          which is exactly the part being hidden. */}
      <span
        className={`period-bar__day ${period.kind === 'date' ? 'active' : ''}`}
        onClick={() => {
          const el = dayRef.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            // Older browsers, or a picker already open - focusing still lets
            // the field be typed into.
            el.focus();
          }
        }}
      >
        <Icon name="calendar" />
        <input
          ref={dayRef}
          type="date"
          value={period.kind === 'date' ? period.date : ''}
          max={todayISO}
          aria-label={t('periodPickDay')}
          onChange={(e) =>
            onChange(
              e.target.value
                ? { kind: 'date', date: e.target.value }
                : { kind: 'month', key: selectedMonth }
            )
          }
        />
      </span>

      {/* Only while a day is active. Without it the day could not be cleared:
          the input's own clear affordance is hidden, and re-picking the same
          month from the dropdown fires no change event. Returns to the month
          that day sat in, so the user lands where they were looking. */}
      {period.kind === 'date' && (
        <button
          type="button"
          className="period-bar__day-clear"
          aria-label={t('periodClearDay')}
          title={t('periodClearDay')}
          onClick={() => onChange({ kind: 'month', key: selectedMonth })}
        >
          ×
        </button>
      )}
    </section>
  );
}

export default memo(PeriodBar);
