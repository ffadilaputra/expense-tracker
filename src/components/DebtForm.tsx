import { memo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR, parseAmount } from '../utils/money';
import type { Debt } from '../types';
import type { DebtFormData } from '../api/sheetApi';

interface DebtFormProps {
  onSubmit: (form: DebtFormData) => Promise<void> | void;
  submitting: boolean;
  initialValue?: Debt;
  onCancel: () => void;
  onDelete?: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function DebtForm({ onSubmit, submitting, initialValue, onCancel, onDelete }: DebtFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [totalText, setTotalText] = useState(
    initialValue ? formatIDR(initialValue.totalAmount).replace('Rp ', '') : ''
  );
  const [count, setCount] = useState(String(initialValue?.instalmentCount ?? 12));
  const [firstDueDate, setFirstDue] = useState(initialValue?.firstDueDate ?? todayISO());
  const [note, setNote] = useState(initialValue?.note ?? '');

  const totalAmount = parseAmount(totalText);
  const instalmentCount = Math.max(1, Math.floor(Number(count) || 0));
  const perInstalment = totalAmount > 0 ? Math.floor(totalAmount / instalmentCount) : 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || totalAmount <= 0) return;
    await onSubmit({
      name: name.trim(),
      totalAmount,
      instalmentCount,
      firstDueDate,
      note: note.trim()
    });
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('debtFieldName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('debtNamePlaceholder')}
          autoFocus={!isEditing}
          required
        />
      </label>

      <label className="txn-form__amount">
        {t('debtFieldTotal')}
        <div className="amount-input">
          <span className="amount-input__prefix">Rp</span>
          <input
            inputMode="numeric"
            value={totalText}
            onChange={(e) => {
              const parsed = parseAmount(e.target.value);
              setTotalText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
            }}
            placeholder={t('amountPlaceholder')}
            required
          />
        </div>
      </label>

      <label>
        {t('debtFieldCount')}
        <input
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))}
          required
        />
      </label>

      <label>
        {t('debtFieldFirstDue')}
        <input type="date" value={firstDueDate} onChange={(e) => setFirstDue(e.target.value)} required />
      </label>

      {/* Shown before saving so the schedule is never a surprise. The last
          instalment absorbs the rounding remainder, so it can differ. */}
      {perInstalment > 0 && (
        <p className="backup__help">
          {t('debtPreview', { count: instalmentCount, amount: formatIDR(perInstalment) })}
        </p>
      )}

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

export default memo(DebtForm);
