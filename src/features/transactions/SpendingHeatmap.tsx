import { memo, useMemo } from 'react';
import { useI18n } from '../../i18n/context';
import { buildHeatmap } from './heatmap';
import { formatIDR } from '../../utils/money';
import type { Transaction } from '../../types';

const WEEKS = 26;

interface SpendingHeatmapProps {
  transactions: Transaction[];
  todayISO: string;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

function SpendingHeatmap({ transactions, todayISO, selectedDate, onSelectDate }: SpendingHeatmapProps) {
  const { t } = useI18n();
  const grid = useMemo(() => buildHeatmap(transactions, WEEKS, todayISO), [transactions, todayISO]);

  return (
    <div className="heatmap">
      <div className="heatmap__head">
        {selectedDate && (
          <button type="button" className="heatmap__clear" onClick={() => onSelectDate(null)}>
            {t('heatmapClearFilter')}
          </button>
        )}
      </div>
      <div className="heatmap__scroll">
        <div className="heatmap__grid">
          {grid.map((col, ci) => (
            <div className="heatmap__col" key={ci}>
              {col.map((cell, ri) => {
                if (!cell.date) return <span key={ri} className="heat-cell heat-cell--pad" />;
                const isSelected = cell.date === selectedDate;
                return (
                  <button
                    key={ri}
                    type="button"
                    className={`heat-cell heat-cell--l${cell.level} ${isSelected ? 'heat-cell--selected' : ''}`}
                    title={t('heatmapDayTotal', { date: cell.date, amount: formatIDR(cell.total) })}
                    aria-label={t('heatmapDayTotal', { date: cell.date, amount: formatIDR(cell.total) })}
                    aria-pressed={isSelected}
                    onClick={() => onSelectDate(isSelected ? null : cell.date)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap__legend">
        <span>{t('heatmapLess')}</span>
        <span className="heat-cell heat-cell--l0" />
        <span className="heat-cell heat-cell--l1" />
        <span className="heat-cell heat-cell--l2" />
        <span className="heat-cell heat-cell--l3" />
        <span className="heat-cell heat-cell--l4" />
        <span>{t('heatmapMore')}</span>
      </div>
    </div>
  );
}

export default memo(SpendingHeatmap);
