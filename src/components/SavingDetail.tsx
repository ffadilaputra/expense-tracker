import { memo, useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { formatIDR, parseAmount } from '../utils/money';
import { summarizeSaving } from '../utils/savings';
import type { Saving, SavingContribution } from '../types';

interface SavingDetailProps {
  saving: Saving;
  contributions: SavingContribution[];
  todayISO: string;
  submitting: boolean;
  onAddContribution: (amount: number, date: string, note: string) => Promise<void>;
  onDeleteContribution: (id: string) => Promise<void>;
  onEditSaving: () => void;
  onClose: () => void;
}

function SavingDetail({
  saving,
  contributions,
  todayISO,
  submitting,
  onAddContribution,
  onDeleteContribution,
  onEditSaving,
  onClose
}: SavingDetailProps) {
  const { t } = useI18n();
  const summary = useMemo(() => summarizeSaving(saving, contributions), [saving, contributions]);

  const mine = useMemo(
    () =>
      contributions
        .filter((c) => c.savingId === saving.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [contributions, saving.id]
  );

  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState('');
  const amount = parseAmount(amountText);

  return (
    <div className="debt-detail">
      <div className="debt-detail__head">
        <div>
          <h3 className="debt-detail__name">
            <span aria-hidden="true">{saving.icon || '◎'}</span> {saving.name}
          </h3>
          <p className="debt-detail__summary">
            {formatIDR(summary.savedAmount)} / {formatIDR(saving.targetAmount)} ·{' '}
            {summary.isComplete
              ? t('savingComplete')
              : t('savingLeft', { amount: formatIDR(summary.remainingAmount) })}
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={onEditSaving}>
          {t('savingEditBtn')}
        </button>
      </div>

      <div className="saving-add">
        <label>
          {t('savingContributionAmount')}
          <div className="amount-input">
            <span className="amount-input__prefix">Rp</span>
            <input
              inputMode="numeric"
              value={amountText}
              onChange={(e) => {
                const parsed = parseAmount(e.target.value);
                setAmountText(parsed === 0 ? '' : formatIDR(parsed).replace('Rp ', ''));
              }}
              placeholder={t('amountPlaceholder')}
            />
          </div>
        </label>
        <label>
          {t('fieldDate')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t('fieldNote')}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          disabled={submitting || amount <= 0}
          onClick={async () => {
            await onAddContribution(amount, date, note.trim());
            setAmountText('');
            setNote('');
          }}
        >
          {t('savingAddContribution')}
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="accounts__note">{t('savingNoContributions')}</p>
      ) : (
        <ul className="contributions">
          {mine.map((c) => (
            <li className="contribution" key={c.id}>
              <span className="contribution__date">{c.date}</span>
              <span className="contribution__note">{c.note}</span>
              <span className="contribution__amount">
                {formatIDR(c.amount)}
                {c._pending && <span className="contribution__pending">{t('pendingTag')}</span>}
              </span>
              <button
                type="button"
                className="transfer-row__delete"
                aria-label={t('deleteBtn')}
                disabled={submitting}
                onClick={() => onDeleteContribution(c.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          {t('closeBtn')}
        </button>
      </div>
    </div>
  );
}

export default memo(SavingDetail);
