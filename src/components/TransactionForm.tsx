import { memo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/context';
import { categoriesFor } from '../config/categories';
import { parseAmount, formatIDR } from '../utils/money';
import type { TransactionFormData, TransactionType } from '../types';

interface TransactionFormProps {
  onSubmit: (form: TransactionFormData) => Promise<void> | void;
  submitting: boolean;
  /** Existing values when editing. Parent keys the component by txn id to remount. */
  initialValue?: TransactionFormData;
  onCancel: () => void;
  onDelete?: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY: TransactionFormData = {
  type: 'expense',
  amount: 0,
  category: '',
  date: todayISO(),
  note: ''
};

function TransactionForm({ onSubmit, submitting, initialValue, onCancel, onDelete }: TransactionFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;
  const seed = initialValue ?? EMPTY;

  const [type, setType] = useState<TransactionType>(seed.type);
  // Amount is held as display text so grouping shows while typing; the stored
  // integer is derived via parseAmount on submit.
  const [amountText, setAmountText] = useState<string>(seed.amount ? formatIDR(seed.amount).replace('Rp ', '') : '');
  const [category, setCategory] = useState(seed.category);
  const [date, setDate] = useState(seed.date);
  const [note, setNote] = useState(seed.note ?? '');

  function handleAmountChange(raw: string) {
    const parsed = parseAmount(raw);
    setAmountText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(amountText);
    if (amount <= 0) return;
    await onSubmit({ type, amount, category: category.trim(), date, note: note.trim() });
  }

  const listId = `categories-${type}`;

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <div className="type-switch" role="group" aria-label={t('fieldAmount')}>
        <button
          type="button"
          className={`type-switch__btn ${type === 'expense' ? 'active' : ''}`}
          aria-pressed={type === 'expense'}
          onClick={() => setType('expense')}
        >
          {t('typeExpense')}
        </button>
        <button
          type="button"
          className={`type-switch__btn ${type === 'income' ? 'active' : ''}`}
          aria-pressed={type === 'income'}
          onClick={() => setType('income')}
        >
          {t('typeIncome')}
        </button>
      </div>

      <label className="txn-form__amount">
        {t('fieldAmount')}
        <div className="amount-input">
          <span className="amount-input__prefix">Rp</span>
          <input
            inputMode="numeric"
            value={amountText}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={t('amountPlaceholder')}
            autoFocus={!isEditing}
            required
          />
        </div>
      </label>

      <label>
        {t('fieldCategory')}
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list={listId}
          placeholder={t('categoryPlaceholder')}
        />
        <datalist id={listId}>
          {categoriesFor(type).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting ? t('savingBtn') : isEditing ? t('updateBtn') : t('saveBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={submitting}>
          {t('cancelBtn')}
        </button>
        {isEditing && onDelete && (
          <button className="btn btn--danger" type="button" onClick={onDelete} disabled={submitting}>
            {t('deleteBtn')}
          </button>
        )}
      </div>
    </form>
  );
}

export default memo(TransactionForm);
