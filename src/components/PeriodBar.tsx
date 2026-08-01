import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { currentMonth, previousMonth, type Period } from '../utils/period';

interface PeriodBarProps {
  period: Period;
  todayISO: string;
  onChange: (period: Period) => void;
}

function PeriodBar({ period, todayISO, onChange }: PeriodBarProps) {
  const { t } = useI18n();
  const thisMonth = currentMonth(todayISO);
  const lastMonth = previousMonth(todayISO);

  const isThisMonth = period.kind === 'month' && period.key === thisMonth.key;
  const isLastMonth = period.kind === 'month' && period.key === lastMonth.key;
  const pickedDate = period.kind === 'date' ? period.date : '';

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

      {/* Reaches any date, including ones older than the heatmap's 26-week
          window. Clearing the native input falls back to the current month. */}
      <label className={`period-bar__date ${pickedDate ? 'active' : ''}`}>
        <span className="period-bar__date-text">
          {pickedDate ? t('periodOnDate', { date: pickedDate }) : t('periodPickDate')}
        </span>
        <input
          type="date"
          className="period-bar__date-input"
          value={pickedDate}
          max={todayISO}
          aria-label={t('periodPickDate')}
          onChange={(e) => onChange(e.target.value ? { kind: 'date', date: e.target.value } : thisMonth)}
        />
      </label>

      {pickedDate && (
        <button
          type="button"
          className="period-bar__clear"
          aria-label={t('periodClearDate')}
          onClick={() => onChange(thisMonth)}
        >
          ×
        </button>
      )}
    </section>
  );
}

export default memo(PeriodBar);
