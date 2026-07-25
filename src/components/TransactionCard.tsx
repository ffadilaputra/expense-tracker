import { memo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import type { Transaction } from '../types';

interface TransactionCardProps {
  transaction: Transaction;
  onEdit: (t: Transaction) => void;
}

function TransactionCard({ transaction, onEdit }: TransactionCardProps) {
  const { t } = useI18n();
  const { type, amount, category, note, _pending } = transaction;
  const sign = type === 'income' ? '+' : '−';

  return (
    <button type="button" className="txn-card" onClick={() => onEdit(transaction)}>
      <span className="txn-card__main">
        <span className="txn-card__category">{category || '—'}</span>
        {note ? <span className="txn-card__note">{note}</span> : null}
        {_pending ? <span className="txn-card__pending">{t('pendingTag')}</span> : null}
      </span>
      <span className={`txn-card__amount txn-card__amount--${type}`}>
        {sign} {formatIDR(amount)}
      </span>
    </button>
  );
}

export default memo(TransactionCard);
