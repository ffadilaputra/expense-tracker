import { memo, useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../config/categories';
import { deriveCategories, UNCATEGORIZED } from './categoryChips';
import { makeViewId, type View, type ViewType } from './views';
import type { Transaction } from '../../types';

export interface ViewFormProps {
  transactions: Transaction[];
  initialValue?: View;
  onSubmit: (view: View) => void;
  onCancel: () => void;
}

const TYPES: ViewType[] = ['all', 'expense', 'income'];

const TYPE_KEYS = {
  all: 'viewTypeAll',
  expense: 'viewTypeExpense',
  income: 'viewTypeIncome'
} as const;

function ViewForm({ transactions, initialValue, onSubmit, onCancel }: ViewFormProps) {
  const { t } = useI18n();
  const isEditing = initialValue !== undefined;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [type, setType] = useState<ViewType>(initialValue?.type ?? 'all');
  const [picked, setPicked] = useState<string[]>(initialValue?.categories ?? []);

  /**
   * Categories actually in use, narrowed to the selected type, plus the presets
   * for that type. Values come from deriveCategories so they are already
   * normalized - including the uncategorized sentinel, which must be stored
   * verbatim rather than trimmed.
   */
  const options = useMemo(() => {
    const set = new Set<string>();

    for (const chip of deriveCategories(transactions)) {
      if (type === 'all' || chip.type === type) set.add(chip.category);
    }
    if (type === 'all' || type === 'expense') for (const c of EXPENSE_CATEGORIES) set.add(c);
    if (type === 'all' || type === 'income') for (const c of INCOME_CATEGORIES) set.add(c);
    for (const c of picked) set.add(c);

    return [...set].sort((a, b) => {
      // Uncategorized last so it never pushes real categories out of reach.
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  }, [transactions, type, picked]);

  function toggle(category: string) {
    setPicked((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '') return;
    onSubmit({
      id: initialValue?.id ?? makeViewId(),
      name: name.trim(),
      categories: picked,
      type
    });
  }

  return (
    <form className="txn-form" onSubmit={handleSubmit}>
      <label>
        {t('viewFieldName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('viewNamePlaceholder')}
          autoFocus
          required
        />
      </label>

      <label>
        {t('viewFieldType')}
        <select value={type} onChange={(e) => setType(e.target.value as ViewType)}>
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {t(TYPE_KEYS[value])}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="alloc-form__categories">
        <legend>{t('viewFieldCategories')}</legend>
        <div className="alloc-form__chips">
          {options.map((category) => (
            <button
              key={category}
              type="button"
              className={`alloc-form__chip ${picked.includes(category) ? 'active' : ''}`}
              onClick={() => toggle(category)}
            >
              {category === UNCATEGORIZED ? t('uncategorized') : category}
            </button>
          ))}
        </div>
        {/* Empty is a valid, useful state here - unlike the allocation picker,
            where it would mean an envelope that nothing draws down. */}
        {picked.length === 0 && (
          <p className="alloc-form__hint">{t('viewAllCategoriesHint')}</p>
        )}
      </fieldset>

      <div className="form-actions">
        <button className="btn btn--primary" type="submit">
          {isEditing ? t('updateBtn') : t('saveBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onCancel}>
          {t('cancelBtn')}
        </button>
      </div>
    </form>
  );
}

export default memo(ViewForm);
