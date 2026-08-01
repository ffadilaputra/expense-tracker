import { memo, useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import { OTHER, buildBreakdown, type BreakdownSegment } from '../utils/categoryBreakdown';
import { UNCATEGORIZED } from '../utils/categoryFilter';
import type { Transaction } from '../types';

interface SpendingDoughnutProps {
  /** Already scoped to the selected period by AppShell. */
  transactions: Transaction[];
}

// Geometry in viewBox units. The ring is drawn as dashed circles rather than
// arc paths: one length per segment, no arc-flag maths, and the 2px separator
// falls out of shortening each dash.
const SIZE = 120;
const RADIUS = 46;
const THICKNESS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2;

function SpendingDoughnut({ transactions }: SpendingDoughnutProps) {
  const { t } = useI18n();
  const { segments, total } = useMemo(() => buildBreakdown(transactions), [transactions]);
  const [active, setActive] = useState<string | null>(null);

  if (segments.length === 0) {
    return <p className="txn-list__empty">{t('breakdownEmpty')}</p>;
  }

  function labelFor(segment: BreakdownSegment): string {
    if (segment.category === OTHER) return t('breakdownOther');
    if (segment.category === UNCATEGORIZED) return t('uncategorized');
    return segment.category;
  }

  const shown = segments.find((s) => s.category === active) ?? null;
  const centreValue = shown ? shown.amount : total;
  const centreLabel = shown ? labelFor(shown) : t('breakdownTotal');

  let offset = 0;

  return (
    <div className="doughnut">
      <div className="doughnut__figure">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="doughnut__svg"
          role="img"
          aria-label={t('breakdownTitle')}
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((segment) => {
              const length = segment.fraction * CIRCUMFERENCE;
              // A single full-circle segment must not be shortened, or the ring
              // would carry a gap with nothing on the other side of it.
              const drawn = segments.length === 1 ? length : Math.max(length - GAP, 0.5);
              const dash = `${drawn} ${CIRCUMFERENCE - drawn}`;
              const thisOffset = offset;
              offset += length;

              return (
                <circle
                  key={segment.category}
                  className={`doughnut__arc doughnut__arc--${segment.slot < 0 ? 'other' : segment.slot}`}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  strokeWidth={THICKNESS}
                  strokeDasharray={dash}
                  strokeDashoffset={-thisOffset}
                  opacity={active && active !== segment.category ? 0.35 : 1}
                  onMouseEnter={() => setActive(segment.category)}
                  onMouseLeave={() => setActive(null)}
                />
              );
            })}
          </g>
        </svg>

        {/* The centre doubles as the tooltip: hovering a segment swaps the
            total for that segment's figure, so there is no floating layer to
            position and it works the same on touch. */}
        <div className="doughnut__centre">
          <span className="doughnut__centre-value">{formatIDR(centreValue)}</span>
          <span className="doughnut__centre-label">{centreLabel}</span>
        </div>
      </div>

      {/* Always present: three of the light-mode hues sit under 3:1 against the
          page, so the figures have to be legible without relying on the colour. */}
      <ul className="doughnut__legend">
        {segments.map((segment) => (
          <li
            key={segment.category}
            className={`doughnut__legend-row ${active === segment.category ? 'is-active' : ''}`}
            onMouseEnter={() => setActive(segment.category)}
            onMouseLeave={() => setActive(null)}
          >
            <span
              className={`doughnut__swatch doughnut__swatch--${segment.slot < 0 ? 'other' : segment.slot}`}
              aria-hidden="true"
            />
            <span className="doughnut__legend-name">{labelFor(segment)}</span>
            <span className="doughnut__legend-value">{formatIDR(segment.amount)}</span>
            <span className="doughnut__legend-share">{Math.round(segment.fraction * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(SpendingDoughnut);
