import { memo, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR, parseAmount } from '../../utils/money';
import type { Saving } from '../../types';
import type { SavingFormData } from '../../api/sheetApi';

interface SavingFormProps {
  onSubmit: (form: SavingFormData) => Promise<void> | void;
  submitting: boolean;
  initialValue?: Saving;
  onCancel: () => void;
  onDelete?: () => void;
}

function SavingForm({ onSubmit, submitting, initialValue, onCancel, onDelete }: SavingFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [icon, setIcon] = useState(initialValue?.icon ?? '');
  const [targetText, setTargetText] = useState(
    initialValue ? formatIDR(initialValue.targetAmount).replace('Rp ', '') : ''
  );
  const [note, setNote] = useState(initialValue?.note ?? '');

  const targetAmount = parseAmount(targetText);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || targetAmount <= 0) return;
    await onSubmit({ name: name.trim(), icon: icon.trim(), targetAmount, note: note.trim() });
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('savingFieldName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('savingNamePlaceholder')}
          autoFocus={!isEditing}
          required
        />
      </label>

      <label>
        {t('savingFieldIcon')}
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder={t('savingIconPlaceholder')}
          maxLength={4}
        />
      </label>

      <label className="txn-form__amount">
        {t('savingFieldTarget')}
        <div className="amount-input">
          <span className="amount-input__prefix">Rp</span>
          <input
            inputMode="numeric"
            value={targetText}
            onChange={(e) => {
              const parsed = parseAmount(e.target.value);
              setTargetText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
            }}
            placeholder={t('amountPlaceholder')}
            required
          />
        </div>
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

export default memo(SavingForm);
