import { memo, useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';
import { formatIDR, parseAmount } from '../../utils/money';
import { EXPENSE_CATEGORIES } from '../../config/categories';
import { resolveClaims } from './allocations';
import type { Allocation, AllocationCadence, Transaction } from '../../types';
import type { AllocationFormData } from '../../api/sheetApi';

interface AllocationFormProps {
  /** Every envelope, so the form can grey out categories already claimed. */
  allocations: Allocation[];
  /** Every transaction, so categories in use but not preset are offered. */
  transactions: Transaction[];
  todayISO: string;
  onSubmit: (form: AllocationFormData) => Promise<void> | void;
  submitting: boolean;
  initialValue?: Allocation;
  onCancel: () => void;
  onDelete?: () => void;
}

const CADENCES: AllocationCadence[] = ['daily', 'weekly', 'monthly', 'days'];

const CADENCE_KEYS = {
  daily: 'allocationCadenceDaily',
  weekly: 'allocationCadenceWeekly',
  monthly: 'allocationCadenceMonthly',
  days: 'allocationCadenceDays'
} as const;

function AllocationForm({
  allocations,
  transactions,
  todayISO,
  onSubmit,
  submitting,
  initialValue,
  onCancel,
  onDelete
}: AllocationFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [icon, setIcon] = useState(initialValue?.icon ?? '');
  const [amountText, setAmountText] = useState(
    initialValue ? formatIDR(initialValue.amount).replace('Rp ', '') : ''
  );
  const [cadence, setCadence] = useState<AllocationCadence>(initialValue?.cadence ?? 'daily');
  const [intervalDays, setIntervalDays] = useState(String(initialValue?.intervalDays ?? 7));
  const [picked, setPicked] = useState<string[]>(initialValue?.categories ?? []);
  const [startDate, setStartDate] = useState(initialValue?.startDate ?? todayISO);
  const [note, setNote] = useState(initialValue?.note ?? '');

  const amount = parseAmount(amountText);

  // The presets plus anything the user has actually spent on, so a category
  // typed freehand into the transaction form can still be budgeted.
  const options = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const txn of transactions) {
      if (txn.type !== 'expense') continue;
      const category = txn.category.trim();
      if (category !== '') set.add(category);
    }
    for (const category of picked) set.add(category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [transactions, picked]);

  /** Category to the name of the envelope already claiming it, excluding this one. */
  const claimedBy = useMemo(() => {
    const owned = resolveClaims(allocations);
    const byCategory = new Map<string, string>();
    for (const allocation of allocations) {
      if (allocation.id === initialValue?.id) continue;
      for (const category of owned.get(allocation.id) ?? []) {
        byCategory.set(category, allocation.name);
      }
    }
    return byCategory;
  }, [allocations, initialValue?.id]);

  function toggle(category: string) {
    setPicked((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || amount <= 0 || picked.length === 0) return;

    const interval = Number.parseInt(intervalDays, 10);
    await onSubmit({
      name: name.trim(),
      icon: icon.trim(),
      amount,
      cadence,
      intervalDays: cadence === 'days' && interval >= 1 ? interval : 1,
      categories: picked,
      // On edit this is ignored by the caller, which rebases instead.
      startDate: isEditing ? initialValue!.startDate : startDate,
      openingBalance: initialValue?.openingBalance ?? 0,
      note: note.trim()
    });
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('allocationFieldName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('allocationNamePlaceholder')}
          autoFocus={!isEditing}
          required
        />
      </label>

      <label>
        {t('allocationFieldIcon')}
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder={t('allocationIconPlaceholder')}
          maxLength={4}
        />
      </label>

      <label className="txn-form__amount">
        {t('allocationFieldAmount')}
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
            required
          />
        </div>
      </label>

      <label>
        {t('allocationFieldCadence')}
        <select value={cadence} onChange={(e) => setCadence(e.target.value as AllocationCadence)}>
          {CADENCES.map((c) => (
            <option key={c} value={c}>
              {t(CADENCE_KEYS[c])}
            </option>
          ))}
        </select>
      </label>

      {cadence === 'days' && (
        <label>
          {t('allocationFieldInterval')}
          <input
            inputMode="numeric"
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, ''))}
            required
          />
        </label>
      )}

      <fieldset className="alloc-form__categories">
        <legend>{t('allocationFieldCategories')}</legend>
        <div className="alloc-form__chips">
          {options.map((category) => {
            const owner = claimedBy.get(category);
            return (
              <button
                key={category}
                type="button"
                className={`alloc-form__chip ${picked.includes(category) ? 'active' : ''}`}
                disabled={owner !== undefined}
                title={owner ? t('allocationClaimedBy', { name: owner }) : undefined}
                onClick={() => toggle(category)}
              >
                {category}
              </button>
            );
          })}
        </div>
        {picked.length === 0 && <p className="alloc-form__hint">{t('allocationNoCategories')}</p>}
      </fieldset>

      {/* Only when creating: on edit the caller rebases, which moves this date,
          so offering the field would be a lie. */}
      {!isEditing && (
        <label>
          {t('allocationFieldStart')}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </label>
      )}

      <label>
        {t('fieldNote')}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('notePlaceholder')}
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

export default memo(AllocationForm);
