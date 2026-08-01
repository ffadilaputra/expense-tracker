import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import {
  NO_OWNER,
  computeUnassignedBalance,
  groupAccountsByOwner,
  totalAcrossAccounts
} from '../utils/accounts';
import type { Account, Transaction, Transfer } from '../types';

interface AccountsScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  onAdd: () => void;
  onEdit: (account: Account) => void;
}

function AccountsScreen({ accounts, transactions, transfers, onAdd, onEdit }: AccountsScreenProps) {
  const { t } = useI18n();

  const groups = useMemo(
    () => groupAccountsByOwner(accounts, transactions, transfers),
    [accounts, transactions, transfers]
  );
  const unassigned = useMemo(() => computeUnassignedBalance(transactions), [transactions]);
  const total = useMemo(
    () => totalAcrossAccounts(accounts, transactions, transfers),
    [accounts, transactions, transfers]
  );

  return (
    <div className="accounts">
      <div className="accounts__head">
        <h2 className="accounts__title">{t('navAccounts')}</h2>
        <button type="button" className="accounts__add" onClick={onAdd} aria-label={t('accountAddLabel')}>
          +
        </button>
      </div>

      {accounts.length === 0 && <p className="txn-list__empty">{t('accountsEmpty')}</p>}

      {groups.map((group) => (
        <section className="owner-group" key={group.owner}>
          <div className="owner-group__head">
            <h3 className="owner-group__name">
              {group.owner === NO_OWNER ? t('accountNoOwner') : group.owner}
            </h3>
            <span className="owner-group__subtotal">{formatIDR(group.subtotal)}</span>
          </div>
          {group.accounts.map(({ account, balance }) => (
            <button
              type="button"
              className="account-row"
              key={account.id}
              onClick={() => onEdit(account)}
            >
              <span className="account-row__icon" aria-hidden="true">
                {account.icon || '•'}
              </span>
              <span className="account-row__name">
                {account.name}
                {account._pending && <span className="account-row__pending">{t('pendingTag')}</span>}
              </span>
              <span className={`account-row__balance ${balance < 0 ? 'is-negative' : ''}`}>
                {formatIDR(balance)}
              </span>
            </button>
          ))}
        </section>
      ))}

      {/* Not an account, so it cannot sit inside an owner group: these are
          transactions that were never assigned anywhere. */}
      {unassigned !== 0 && (
        <div className="accounts__unassigned">
          <span>{t('accountUnassigned')}</span>
          <span>{formatIDR(unassigned)}</span>
        </div>
      )}

      <div className="accounts__total">
        <span>{t('accountTotal')}</span>
        <span>{formatIDR(total)}</span>
      </div>

      <p className="accounts__note">{t('accountNoOpeningBalance')}</p>
    </div>
  );
}

export default memo(AccountsScreen);
