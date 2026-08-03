import { memo, useMemo } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR } from '../../utils/money';
import { resolveClaims, summarizeAllocations } from './allocations';
import { shortDate } from '../transactions/dateGroups';
import type { Allocation, Transaction } from '../../types';
import './AllocationDetail.css';

interface AllocationDetailProps {
  allocation: Allocation;
  allocations: Allocation[];
  transactions: Transaction[];
  todayISO: string;
  submitting: boolean;
  onEdit: () => void;
  onReset: () => void;
  onClose: () => void;
}

const RECENT_LIMIT = 10;

function AllocationDetail({
  allocation,
  allocations,
  transactions,
  todayISO,
  submitting,
  onEdit,
  onReset,
  onClose
}: AllocationDetailProps) {
  const { t, locale } = useI18n();

  const summary = useMemo(() => {
    const rows = summarizeAllocations(allocations, transactions, todayISO);
    return rows.find((r) => r.allocation.id === allocation.id)?.summary ?? null;
  }, [allocations, transactions, todayISO, allocation.id]);

  const owned = useMemo(
    () => resolveClaims(allocations).get(allocation.id) ?? [],
    [allocations, allocation.id]
  );

  /** What actually drew the envelope down, newest first. */
  const recent = useMemo(() => {
    const claimed = new Set(owned);
    return transactions
      .filter(
        (txn) =>
          txn.type === 'expense' &&
          claimed.has(txn.category.trim()) &&
          txn.date >= allocation.startDate &&
          txn.date <= todayISO
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_LIMIT);
  }, [transactions, owned, allocation.startDate, todayISO]);

  // The envelope is always in `allocations`, so this is unreachable in
  // practice - but it keeps the component honest rather than asserting.
  if (!summary) return null;

  const periodLabel =
    summary.periodStart === summary.periodEnd
      ? summary.periodStart === todayISO
        ? t('allocationPeriodToday')
        : shortDate(summary.periodStart, locale)
      : t('allocationPeriodRange', {
          start: shortDate(summary.periodStart, locale),
          end: shortDate(summary.periodEnd, locale)
        });

  return (
    <div className="alloc-detail">
      <h2 className="modal__title">
        {allocation.icon ? `${allocation.icon} ` : ''}
        {allocation.name}
      </h2>

      <p className={`alloc-detail__amount ${summary.isOverdrawn ? 'is-over' : ''}`}>
        {summary.isOverdrawn
          ? t('allocationOverdrawn', { amount: formatIDR(Math.abs(summary.available)) })
          : t('allocationLeft', { amount: formatIDR(summary.available) })}
      </p>

      <p className="alloc-detail__period">{periodLabel}</p>

      <dl className="alloc-detail__figures">
        <div>
          <dt>{t('allocationGranted')}</dt>
          <dd>{formatIDR(summary.granted)}</dd>
        </div>
        <div>
          <dt>{t('allocationSpent')}</dt>
          <dd>{formatIDR(summary.spent)}</dd>
        </div>
      </dl>

      <p className="alloc-detail__progress">
        {t('allocationPeriodProgress', {
          spent: formatIDR(summary.spentThisPeriod),
          amount: formatIDR(allocation.amount)
        })}
      </p>

      <div className="alloc-detail__chips">
        {owned.map((category) => (
          <span key={category} className="alloc-detail__chip">
            {category}
          </span>
        ))}
      </div>

      <h3 className="alloc-detail__subtitle">{t('allocationRecentTitle')}</h3>
      {recent.length === 0 ? (
        <p className="alloc-detail__empty">{t('allocationRecentEmpty')}</p>
      ) : (
        <ul className="alloc-detail__list">
          {recent.map((txn) => (
            <li key={txn.id}>
              <span className="alloc-detail__list-date">{shortDate(txn.date, locale)}</span>
              <span className="alloc-detail__list-category">{txn.category}</span>
              <span className="alloc-detail__list-amount">{formatIDR(txn.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button className="btn btn--primary" type="button" onClick={onEdit} disabled={submitting}>
          {t('allocationEditTitle')}
        </button>
        {/* Grouped with Edit, not Delete: this adjusts an envelope the user
            intends to keep using. */}
        <button className="btn btn--secondary" type="button" onClick={onReset} disabled={submitting}>
          {t('allocationResetBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onClose} disabled={submitting}>
          {t('closeBtn')}
        </button>
      </div>
    </div>
  );
}

export default memo(AllocationDetail);
