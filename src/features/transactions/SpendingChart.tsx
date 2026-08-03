import { memo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import SpendingHeatmap from './SpendingHeatmap';
import SpendingDoughnut from './SpendingDoughnut';
import type { Transaction } from '../../types';
import './SpendingChart.css';

/** Named ChartMode, not View: `views.ts` in this folder owns that word now. */
type ChartMode = 'activity' | 'breakdown';

interface SpendingChartProps {
  /** Full history: the heatmap's shading scale needs the whole range. */
  transactions: Transaction[];
  /** Scoped to the selected period: the breakdown answers "in this period". */
  periodTransactions: Transaction[];
  todayISO: string;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

function SpendingChart({
  transactions,
  periodTransactions,
  todayISO,
  selectedDate,
  onSelectDate
}: SpendingChartProps) {
  const { t } = useI18n();
  const [view, setView] = useState<ChartMode>('activity');

  return (
    <section className="spending" aria-label={t('heatmapTitle')}>
      <div className="spending__head">
        <h2 className="spending__title">{t('heatmapTitle')}</h2>
        <div className="spending__views" role="group" aria-label={t('chartViewLabel')}>
          <button
            type="button"
            className={`spending__view ${view === 'activity' ? 'active' : ''}`}
            aria-pressed={view === 'activity'}
            onClick={() => setView('activity')}
          >
            {t('chartActivity')}
          </button>
          <button
            type="button"
            className={`spending__view ${view === 'breakdown' ? 'active' : ''}`}
            aria-pressed={view === 'breakdown'}
            onClick={() => setView('breakdown')}
          >
            {t('chartBreakdown')}
          </button>
        </div>
      </div>

      {view === 'activity' ? (
        <SpendingHeatmap
          transactions={transactions}
          todayISO={todayISO}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      ) : (
        <SpendingDoughnut transactions={periodTransactions} />
      )}
    </section>
  );
}

export default memo(SpendingChart);
