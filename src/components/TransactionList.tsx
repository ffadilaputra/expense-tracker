import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { groupByDate, relativeDay } from '../utils/dateGroups';
import TransactionCard from './TransactionCard';
import type { Transaction } from '../types';

interface TransactionListProps {
  transactions: Transaction[];
  todayISO: string;
  selectedDate: string | null;
  onEdit: (t: Transaction) => void;
}

function TransactionList({ transactions, todayISO, selectedDate, onEdit }: TransactionListProps) {
  const { t } = useI18n();

  const visible = useMemo(
    () => (selectedDate ? transactions.filter((x) => x.date === selectedDate) : transactions),
    [transactions, selectedDate]
  );
  const groups = useMemo(() => groupByDate(visible), [visible]);

  if (groups.length === 0) {
    return (
      <p className="txn-list__empty">
        {selectedDate ? t('emptyDayFiltered') : t('emptyTransactions')}
      </p>
    );
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
