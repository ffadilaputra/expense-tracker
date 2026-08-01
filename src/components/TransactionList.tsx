import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { groupByDate, relativeDay, shortDate, weekdayName } from '../utils/dateGroups';
import TransactionCard from './TransactionCard';
import type { Transaction } from '../types';
import type { TranslationKey } from '../i18n/translations';

interface TransactionListProps {
  /** Already scoped to the period and category by AppShell. */
  transactions: Transaction[];
  todayISO: string;
  /** Which "nothing here" message fits the active filters. */
  emptyKey: TranslationKey;
  /** Account id to display label, so the list does not have to search. */
  accountLabels: Map<string, string>;
  onEdit: (t: Transaction) => void;
}

function TransactionList({
  transactions,
  todayISO,
  emptyKey,
  accountLabels,
  onEdit
}: TransactionListProps) {
  const { t, locale } = useI18n();
  const groups = useMemo(() => groupByDate(transactions), [transactions]);

  if (groups.length === 0) {
    return <p className="txn-list__empty">{t(emptyKey)}</p>;
  }

  /**
   * Always leads with the weekday, since that is what makes a date readable at
   * a glance; "Today" / "Yesterday" follow as an extra marker rather than
   * replacing it.
   */
  function labelFor(date: string): string {
    const heading = `${weekdayName(date, locale)}, ${shortDate(date, locale)}`;
    const rel = relativeDay(date, todayISO);
    if (rel === 'today') return `${heading} · ${t('relativeToday')}`;
    if (rel === 'yesterday') return `${heading} · ${t('relativeYesterday')}`;
    return heading;
  }

  return (
    <div className="txn-list">
      {groups.map((group) => (
        <section className="txn-group" key={group.date}>
          <h2 className="txn-group__heading">{labelFor(group.date)}</h2>
          {group.items.map((txn) => (
            <TransactionCard
              key={txn.id}
              transaction={txn}
              accountLabel={txn.accountId ? accountLabels.get(txn.accountId) : undefined}
              onEdit={onEdit}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

export default memo(TransactionList);
