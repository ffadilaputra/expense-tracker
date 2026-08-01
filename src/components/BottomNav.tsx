import { memo } from 'react';
import { useI18n } from '../i18n/context';

export type Tab = 'transactions' | 'accounts';

interface BottomNavProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

function BottomNav({ tab, onChange }: BottomNavProps) {
  const { t } = useI18n();

  return (
    <nav className="bottom-nav" aria-label={t('navLabel')}>
      <button
        type="button"
        className={`bottom-nav__btn ${tab === 'transactions' ? 'active' : ''}`}
        aria-pressed={tab === 'transactions'}
        onClick={() => onChange('transactions')}
      >
        {t('navTransactions')}
      </button>
      <button
        type="button"
        className={`bottom-nav__btn ${tab === 'accounts' ? 'active' : ''}`}
        aria-pressed={tab === 'accounts'}
        onClick={() => onChange('accounts')}
      >
        {t('navAccounts')}
      </button>
    </nav>
  );
}

export default memo(BottomNav);
