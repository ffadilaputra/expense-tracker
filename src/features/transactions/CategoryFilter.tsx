import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { sameChip, UNCATEGORIZED, type CategoryChip } from './categoryChips';
import { ALL_VIEW_ID, type View } from './views';
import './CategoryFilter.css';

interface CategoryFilterProps {
  chips: CategoryChip[];
  selected: CategoryChip | null;
  onSelect: (chip: CategoryChip | null) => void;
  /** Saved views, shown as chips ahead of the auto-derived categories. */
  views: View[];
  activeViewId: string;
  onSelectView: (id: string) => void;
  onManageViews: () => void;
}

/**
 * One row, two axes.
 *
 * A view rescopes the whole screen; a category chip narrows only what is below
 * it. They share a row because they are both "narrow what I am looking at",
 * and a divider plus distinct chip styling carries the difference.
 *
 * Views deliberately have no "All" chip of their own: the category group
 * already owns that word, and two chips labelled All meaning different things
 * is worse than the toggle behaviour used here - tapping an active view clears
 * it, exactly as tapping an active category chip already does.
 */
function CategoryFilter({
  chips,
  selected,
  onSelect,
  views,
  activeViewId,
  onSelectView,
  onManageViews
}: CategoryFilterProps) {
  const { t } = useI18n();

  // A single category is nothing to narrow down and an empty period has
  // nothing at all - but saved views must never be stranded off screen, so
  // their presence keeps the row alive on its own.
  if (chips.length < 2 && views.length === 0) return null;

  const firstIncomeIndex = chips.findIndex((c) => c.type === 'income');

  return (
    <section className="cat-filter" aria-label={t('categoryFilterLabel')}>
      <div className="cat-filter__row" role="group" aria-label={t('categoryFilterLabel')}>
        {views.map((view) => {
          const isActive = view.id === activeViewId;
          return (
            <button
              key={view.id}
              type="button"
              className={`cat-filter__chip cat-filter__chip--view ${isActive ? 'active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onSelectView(isActive ? ALL_VIEW_ID : view.id)}
            >
              {view.name}
            </button>
          );
        })}

        {views.length > 0 && chips.length > 0 && (
          <span className="cat-filter__divider cat-filter__divider--strong" aria-hidden="true" />
        )}

        {chips.length > 0 && (
          <button
            type="button"
            className={`cat-filter__chip ${selected === null ? 'active' : ''}`}
            aria-pressed={selected === null}
            onClick={() => onSelect(null)}
          >
            {t('filterAllLabel')}
          </button>
        )}

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

        {/* The only entry point for creating a view, so it rides along with the
            row rather than living in a menu where nobody would find it. */}
        <button
          type="button"
          className="cat-filter__manage"
          onClick={onManageViews}
          aria-label={t('viewManageLabel')}
          title={t('viewManageLabel')}
        >
          ⋯
        </button>
      </div>
    </section>
  );
}

export default memo(CategoryFilter);
