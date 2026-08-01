import { memo, useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR } from '../utils/money';
import { buildSchedule, summarizeDebt, type DebtSummary } from '../utils/debt';
import type { Debt, DebtInstalment } from '../types';

interface DebtsScreenProps {
  debts: Debt[];
  instalments: DebtInstalment[];
  todayISO: string;
  onAdd: () => void;
  onOpen: (debt: Debt) => void;
}

function DebtsScreen({ debts, instalments, todayISO, onAdd, onOpen }: DebtsScreenProps) {
  const { t } = useI18n();

  const rows = useMemo(
    () =>
      debts
        .map((debt) => ({
          debt,
          summary: summarizeDebt(buildSchedule(debt, instalments, todayISO))
        }))
        // Settled debts drop to the bottom: what is still owed is the point of
        // the screen, and a paid-off loan is history.
        .sort((a, b) => {
          if (a.summary.isSettled !== b.summary.isSettled) return a.summary.isSettled ? 1 : -1;
          if (a.summary.hasOverdue !== b.summary.hasOverdue) return a.summary.hasOverdue ? -1 : 1;
          return (a.summary.nextDue?.dueDate ?? '').localeCompare(b.summary.nextDue?.dueDate ?? '');
        }),
    [debts, instalments, todayISO]
  );

  const outstanding = rows.reduce((sum, r) => sum + r.summary.remainingAmount, 0);

  return (
    <div className="accounts">
      <div className="accounts__head">
        <h2 className="accounts__title">{t('navDebts')}</h2>
        <button type="button" className="accounts__add" onClick={onAdd} aria-label={t('debtAddLabel')}>
          +
        </button>
      </div>

      {debts.length === 0 && <p className="txn-list__empty">{t('debtsEmpty')}</p>}

      {rows.map(({ debt, summary }) => (
        <DebtRow key={debt.id} debt={debt} summary={summary} onOpen={() => onOpen(debt)} />
      ))}

      {debts.length > 0 && (
        <div className="accounts__total">
          <span>{t('debtOutstanding')}</span>
          <span>{formatIDR(outstanding)}</span>
        </div>
      )}
    </div>
  );
}

interface DebtRowProps {
  debt: Debt;
  summary: DebtSummary;
  onOpen: () => void;
}

function DebtRow({ debt, summary, onOpen }: DebtRowProps) {
  const { t } = useI18n();
  const progress = summary.count === 0 ? 0 : summary.paidCount / summary.count;

  return (
    <button type="button" className="debt-row" onClick={onOpen}>
      <span className="debt-row__head">
        <span className="debt-row__name">{debt.name}</span>
        <span className="debt-row__remaining">{formatIDR(summary.remainingAmount)}</span>
      </span>

      <span className="debt-row__bar" aria-hidden="true">
        <span className="debt-row__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>

      <span className="debt-row__meta">
        <span>{t('debtProgress', { paid: summary.paidCount, count: summary.count })}</span>
        {summary.isSettled ? (
          <span className="debt-row__settled">{t('debtSettled')}</span>
        ) : summary.hasOverdue ? (
          <span className="debt-row__overdue">{t('debtOverdue')}</span>
        ) : summary.nextDue ? (
          <span>{t('debtNextDue', { date: summary.nextDue.dueDate })}</span>
        ) : null}
      </span>
    </button>
  );
}

export default memo(DebtsScreen);
