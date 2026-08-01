import { memo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR, parseAmount } from '../utils/money';
import type { Account } from '../types';
import type { TransferFormData } from '../api/sheetApi';

interface TransferFormProps {
  accounts: Account[];
  onSubmit: (form: TransferFormData) => Promise<void> | void;
  submitting: boolean;
  onCancel: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function TransferForm({ accounts, onSubmit, submitting, onCancel }: TransferFormProps) {
  const { t } = useI18n();

  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setTo] = useState(accounts[1]?.id ?? '');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');

  const amount = parseAmount(amountText);
  const sameAccount = fromAccountId !== '' && fromAccountId === toAccountId;
  const canSubmit = !sameAccount && fromAccountId !== '' && toAccountId !== '' && amount > 0;

  function handleAmountChange(raw: string) {
    const parsed = parseAmount(raw);
    setAmountText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit({ fromAccountId, toAccountId, amount, date, note: note.trim() });
  }

  function options() {
    return accounts.map((a) => (
      <option key={a.id} value={a.id}>
        {a.icon ? `${a.icon} ${a.name}` : a.name}
      </option>
    ));
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('transferFrom')}
        <select value={fromAccountId} onChange={(e) => setFrom(e.target.value)} required>
          <option value="">{t('accountNone')}</option>
          {options()}
        </select>
      </label>

      <label>
        {t('transferTo')}
        <select value={toAccountId} onChange={(e) => setTo(e.target.value)} required>
          <option value="">{t('accountNone')}</option>
          {options()}
        </select>
      </label>

      {sameAccount && <p className="backup__warn">{t('transferSameAccount')}</p>}

      <label className="txn-form__amount">
        {t('fieldAmount')}
        <div className="amount-input">
          <span className="amount-input__prefix">Rp</span>
          <input
            inputMode="numeric"
            value={amountText}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={t('amountPlaceholder')}
            autoFocus
            required
          />
        </div>
      </label>

      <label>
        {t('fieldDate')}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <label>
        {t('fieldNote')}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
      </label>

      <div className="form-actions">
        <button className="btn btn--primary" type="submit" disabled={submitting || !canSubmit}>
          {submitting ? t('savingBtn') : t('transferSubmit')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={submitting}>
          {t('cancelBtn')}
        </button>
      </div>
    </form>
  );
}

export default memo(TransferForm);
