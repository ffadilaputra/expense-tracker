import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { groupByDate, relativeDay } from '../utils/dateGroups';
import TransactionCard from './TransactionCard';
import type { Transaction } from '../types';
import type { TranslationKey } from '../i18n/translations';

interface TransactionListProps {
  /** Already scoped to the period and category by AppShell. */
  transactions: Transaction[];
  todayISO: string;
  /** Which "nothing here" message fits the active filters. */
  emptyKey: TranslationKey;
  onEdit: (t: Transaction) => void;
}

function TransactionList({ transactions, todayISO, emptyKey, onEdit }: TransactionListProps) {
  const { t } = useI18n();
  const groups = useMemo(() => groupByDate(transactions), [transactions]);

  if (groups.length === 0) {
    return <p className="txn-list__empty">{t(emptyKey)}</p>;
  }

  function labelFor(date: string): string {
    const rel = relativeDay(date, todayISO);
    if (rel === 'today') return t('relativeToday');
    if (rel === 'yesterday') return t('relativeYesterday');
    return date;
  }

  return (
    <div className="txn-list">
      {groups.map((group) => (
        <section className="txn-group" key={group.date}>
          <h2 className="txn-group__heading">{labelFor(group.date)}</h2>
          {group.items.map((txn) => (
            <TransactionCard key={txn.id} transaction={txn} onEdit={onEdit} />
          ))}
        </section>
      ))}
    </div>
  );
}

export default memo(TransactionList);
