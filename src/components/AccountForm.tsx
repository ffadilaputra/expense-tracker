import { memo, useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/context';
import type { Account } from '../types';
import type { AccountFormData } from '../api/sheetApi';

interface AccountFormProps {
  onSubmit: (form: AccountFormData) => Promise<void> | void;
  submitting: boolean;
  /** Existing values when editing. */
  initialValue?: Account;
  /** Every account, used to suggest owners already in use. */
  accounts: Account[];
  onCancel: () => void;
  onDelete?: () => void;
}

function AccountForm({
  onSubmit,
  submitting,
  initialValue,
  accounts,
  onCancel,
  onDelete
}: AccountFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [ownerName, setOwnerName] = useState(initialValue?.ownerName ?? '');
  const [icon, setIcon] = useState(initialValue?.icon ?? '');

  // Owners already in use, so the second account for a person can be typed by
  // picking rather than re-typing - the same idea as the category datalist.
  const owners = useMemo(() => {
    const seen = new Set<string>();
    for (const a of accounts) {
      const owner = (a.ownerName ?? '').trim();
      if (owner !== '') seen.add(owner);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    await onSubmit({ name: trimmed, ownerName: ownerName.trim(), icon: icon.trim() });
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('accountFieldName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('accountNamePlaceholder')}
          autoFocus={!isEditing}
          required
        />
      </label>

      <label>
        {t('accountFieldOwner')}
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          list="account-owners"
          placeholder={t('accountOwnerPlaceholder')}
        />
        <datalist id="account-owners">
          {owners.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </label>

      <label>
        {t('accountFieldIcon')}
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder={t('accountIconPlaceholder')}
          maxLength={4}
        />
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

export default memo(AccountForm);
