import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { sameChip, UNCATEGORIZED, type CategoryChip } from './categoryChips';
import './CategoryFilter.css';

interface CategoryFilterProps {
  chips: CategoryChip[];
  selected: CategoryChip | null;
  onSelect: (chip: CategoryChip | null) => void;
}

function CategoryFilter({ chips, selected, onSelect }: CategoryFilterProps) {
  const { t } = useI18n();

  // Nothing to narrow down with a single category, and nothing at all when the
  // period is empty — either way the row would only take up space.
  if (chips.length < 2) return null;

  const firstIncomeIndex = chips.findIndex((c) => c.type === 'income');

  return (
    <section className="cat-filter" aria-label={t('categoryFilterLabel')}>
      <div className="cat-filter__row" role="group" aria-label={t('categoryFilterLabel')}>
        <button
          type="button"
          className={`cat-filter__chip ${selected === null ? 'active' : ''}`}
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
        >
          {t('filterAllLabel')}
        </button>

        {chips.map((chip, i) => {
          const isSelected = sameChip(chip, selected);
          const label = chip.category === UNCATEGORIZED ? t('uncategorized') : chip.category;
          return (
            <span className="cat-filter__slot" key={`${chip.type} ${chip.category}`}>
              {i === firstIncomeIndex && i > 0 && <span className="cat-filter__divider" aria-hidden="true" />}
              <button
                type="button"
                className={`cat-filter__chip cat-filter__chip--${chip.type} ${isSelected ? 'active' : ''}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : chip)}
              >
                {label}
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}

export default memo(CategoryFilter);
