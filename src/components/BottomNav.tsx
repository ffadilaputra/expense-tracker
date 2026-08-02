import { memo } from 'react';
import { useI18n } from '../i18n/context';
import Icon from './Icon';
import './BottomNav.css';

export type Tab = 'transactions' | 'accounts' | 'debts' | 'savings';

interface BottomNavProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

function BottomNav({ tab, onChange }: BottomNavProps) {
  const { t } = useI18n();

  return (
    <nav className="bottom-nav" aria-label={t('navLabel')}>
      <div className="bottom-nav__inner">
      <button
        type="button"
        className={`bottom-nav__btn ${tab === 'transactions' ? 'active' : ''}`}
        aria-pressed={tab === 'transactions'}
        onClick={() => onChange('transactions')}
      >
        <Icon name="list" />
        {t('navTransactions')}
      </button>
      <button
        type="button"
        className={`bottom-nav__btn ${tab === 'accounts' ? 'active' : ''}`}
        aria-pressed={tab === 'accounts'}
        onClick={() => onChange('accounts')}
      >
        <Icon name="wallet" />
        {t('navAccounts')}
      </button>
      <button
        type="button"
        className={`bottom-nav__btn ${tab === 'debts' ? 'active' : ''}`}
        aria-pressed={tab === 'debts'}
        onClick={() => onChange('debts')}
      >
        <Icon name="debt" />
        {t('navDebts')}
      </button>
      <button
        type="button"
        className={`bottom-nav__btn ${tab === 'savings' ? 'active' : ''}`}
        aria-pressed={tab === 'savings'}
        onClick={() => onChange('savings')}
      >
        <Icon name="saving" />
        {t('navSavings')}
      </button>
      </div>
    </nav>
  );
}

export default memo(BottomNav);
