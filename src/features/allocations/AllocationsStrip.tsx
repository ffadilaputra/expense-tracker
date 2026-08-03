import { memo, useMemo } from 'react';
import { useI18n } from '../../i18n/context';
import { summarizeAllocations } from './allocations';
import AllocationCard from './AllocationCard';
import type { Allocation, Transaction } from '../../types';
import './AllocationsStrip.css';

export interface AllocationsStripProps {
  allocations: Allocation[];
  transactions: Transaction[];
  todayISO: string;
  onOpen: (allocation: Allocation) => void;
  onAdd: () => void;
}

/**
 * Envelopes on the transactions page, one card each.
 *
 * Unlike SavingsStrip this never returns null. Savings can be created from the
 * Savings tab, but allocations have no tab, so this strip is the only entry
 * point and cannot hide when there is nothing yet - hence the empty-state row.
 */
function AllocationsStrip({
  allocations,
  transactions,
  todayISO,
  onOpen,
  onAdd
}: AllocationsStripProps) {
  const { t } = useI18n();
  const rows = useMemo(
    () => summarizeAllocations(allocations, transactions, todayISO),
    [allocations, transactions, todayISO]
  );

  if (allocations.length === 0) {
    return (
      <section className="alloc-strip" aria-label={t('allocationStripLabel')}>
        <button type="button" className="alloc-strip__cta" onClick={onAdd}>
          + {t('allocationEmptyCta')}
        </button>
      </section>
    );
  }

  return (
    <section className="alloc-strip" aria-label={t('allocationStripLabel')}>
      <div className="alloc-strip__head">
        <h2 className="alloc-strip__title">{t('allocationStripLabel')}</h2>
      </div>

      <div className="alloc-strip__scroll">
        <div className="alloc-strip__row">
          {rows.map((row) => (
            <AllocationCard
              key={row.allocation.id}
              row={row}
              onOpen={() => onOpen(row.allocation)}
            />
          ))}
          <button
            type="button"
            className="alloc-strip__add"
            onClick={onAdd}
            aria-label={t('allocationAddLabel')}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}

export default memo(AllocationsStrip);
