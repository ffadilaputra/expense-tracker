import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import type { TrendBucket } from './reportData';
import './TrendChart.css';

interface TrendChartProps {
  /** Never empty - the caller omits the chart entirely for a single day. */
  buckets: TrendBucket[];
}

// viewBox units. One slot per bucket holds an income bar and an expense bar
// either side of the slot's centre line.
const PLOT = 90;
const SLOT = 12;
const BAR = 4;
const AXIS = 12;

function TrendChart({ buckets }: TrendChartProps) {
  const { t } = useI18n();

  // Both series share one scale so the two bars in a slot are directly
  // comparable; the floor of 1 keeps an all-zero period from dividing by zero.
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)));
  const width = buckets.length * SLOT;

  // Thirty-one day labels do not fit; twelve months do. Every fifth day keeps
  // the axis readable without losing the shape of the month.
  const step = buckets.length > 12 ? 5 : 1;

  return (
    <section className="trend" aria-label={t('reportTrendTitle')}>
      <div className="trend__head">
        <h2 className="trend__title">{t('reportTrendTitle')}</h2>
        <ul className="trend__legend">
          <li>
            <span className="trend__swatch trend__swatch--income" aria-hidden="true" />
            {t('incomeLabel')}
          </li>
          <li>
            <span className="trend__swatch trend__swatch--expense" aria-hidden="true" />
            {t('expenseLabel')}
          </li>
        </ul>
      </div>

      <svg
        className="trend__svg"
        viewBox={`0 0 ${width} ${PLOT + AXIS}`}
        role="img"
        aria-label={t('reportTrendTitle')}
      >
        {buckets.map((bucket, i) => {
          const x = i * SLOT;
          const incomeH = (bucket.income / max) * PLOT;
          const expenseH = (bucket.expense / max) * PLOT;

          return (
            <g key={bucket.label}>
              <rect
                className="trend__bar trend__bar--income"
                x={x + SLOT / 2 - BAR - 0.5}
                y={PLOT - incomeH}
                width={BAR}
                height={incomeH}
              />
              <rect
                className="trend__bar trend__bar--expense"
                x={x + SLOT / 2 + 0.5}
                y={PLOT - expenseH}
                width={BAR}
                height={expenseH}
              />
              {i % step === 0 && (
                <text className="trend__label" x={x + SLOT / 2} y={PLOT + 9} textAnchor="middle">
                  {bucket.label}
                </text>
              )}
            </g>
          );
        })}
        <line className="trend__axis" x1="0" y1={PLOT} x2={width} y2={PLOT} />
      </svg>
    </section>
  );
}

export default memo(TrendChart);
