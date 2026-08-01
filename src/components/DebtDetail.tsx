import { memo, useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR, parseAmount } from '../utils/money';
import { buildSchedule, summarizeDebt, type ScheduleRow } from '../utils/debt';
import type { Account, Debt, DebtInstalment } from '../types';

interface DebtDetailProps {
  debt: Debt;
  instalments: DebtInstalment[];
  accounts: Account[];
  todayISO: string;
  submitting: boolean;
  onPay: (row: ScheduleRow, accountId: string, date: string) => Promise<void>;
  onUnpay: (row: ScheduleRow) => Promise<void>;
  onOverride: (row: ScheduleRow, amount: number, dueDate: string) => Promise<void>;
  onEditDebt: () => void;
  onClose: () => void;
}

function DebtDetail({
  debt,
  instalments,
  accounts,
  todayISO,
  submitting,
  onPay,
  onUnpay,
  onOverride,
  onEditDebt,
  onClose
}: DebtDetailProps) {
  const { t } = useI18n();
  const schedule = useMemo(
    () => buildSchedule(debt, instalments, todayISO),
    [debt, instalments, todayISO]
  );
  const summary = useMemo(() => summarizeDebt(schedule), [schedule]);

  /** Which instalment has its pay or edit panel open, and in which mode. */
  const [open, setOpen] = useState<{ number: number; mode: 'pay' | 'edit' } | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [payDate, setPayDate] = useState(todayISO);
  const [amountText, setAmountText] = useState('');
  const [dueDate, setDueDate] = useState('');

  function startPay(row: ScheduleRow) {
    setOpen({ number: row.number, mode: 'pay' });
    setPayDate(todayISO);
  }

  function startEdit(row: ScheduleRow) {
    setOpen({ number: row.number, mode: 'edit' });
    setAmountText(formatIDR(row.amount).replace('Rp ', ''));
    setDueDate(row.dueDate);
  }

  return (
    <div className="debt-detail">
      <div className="debt-detail__head">
        <div>
          <h3 className="debt-detail__name">{debt.name}</h3>
          <p className="debt-detail__summary">
            {t('debtProgress', { paid: summary.paidCount, count: summary.count })} ·{' '}
            {t('debtRemaining', { amount: formatIDR(summary.remainingAmount) })}
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={onEditDebt}>
          {t('debtEditBtn')}
        </button>
      </div>

      <ol className="instalments">
        {schedule.map((row) => {
          const isOpen = open?.number === row.number;
          return (
            <li className={`instalment instalment--${row.status}`} key={row.number}>
              <div className="instalment__row">
                <span className="instalment__number">{row.number}</span>
                <span className="instalment__dates">
                  <span className="instalment__due">{row.dueDate}</span>
                  <span className={`instalment__status instalment__status--${row.status}`}>
                    {row.status === 'paid'
                      ? t('instalmentPaidOn', { date: row.paidDate ?? '' })
                      : row.status === 'overdue'
                        ? t('instalmentOverdue')
                        : t('instalmentDue')}
                  </span>
                </span>
                <span className="instalment__amount">{formatIDR(row.amount)}</span>
                <span className="instalment__actions">
                  {row.status === 'paid' ? (
                    <button type="button" onClick={() => onUnpay(row)} disabled={submitting}>
                      {t('instalmentUndo')}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(row)} disabled={submitting}>
                        {t('instalmentEdit')}
                      </button>
                      <button
                        type="button"
                        className="instalment__pay"
                        onClick={() => startPay(row)}
                        disabled={submitting}
                      >
                        {t('instalmentPay')}
                      </button>
                    </>
                  )}
                </span>
              </div>

              {isOpen && open.mode === 'pay' && (
                <div className="instalment__panel">
                  <label>
                    {t('fieldAccount')}
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                      <option value="">{t('accountNone')}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon ? `${a.icon} ${a.name}` : a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('instalmentPaidDate')}
                    <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={submitting}
                      onClick={async () => {
                        await onPay(row, accountId, payDate);
                        setOpen(null);
                      }}
                    >
                      {t('instalmentConfirmPay', { amount: formatIDR(row.amount) })}
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => setOpen(null)}>
                      {t('cancelBtn')}
                    </button>
                  </div>
                </div>
              )}

              {isOpen && open.mode === 'edit' && (
                <div className="instalment__panel">
                  <label>
                    {t('fieldAmount')}
                    <input
                      inputMode="numeric"
                      value={amountText}
                      onChange={(e) => {
                        const parsed = parseAmount(e.target.value);
                        setAmountText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
                      }}
                    />
                  </label>
                  <label>
                    {t('instalmentDueDate')}
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={submitting}
                      onClick={async () => {
                        await onOverride(row, parseAmount(amountText), dueDate);
                        setOpen(null);
                      }}
                    >
                      {t('saveBtn')}
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => setOpen(null)}>
                      {t('cancelBtn')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          {t('closeBtn')}
        </button>
      </div>
    </div>
  );
}

export default memo(DebtDetail);
