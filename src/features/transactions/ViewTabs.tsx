import { memo } from 'react';
import { useI18n } from '../../i18n/context';
import { ALL_VIEW_ID, type View } from './views';
import './ViewTabs.css';

export interface ViewTabsProps {
  /** User views only; the All tab is rendered here, not passed in. */
  views: View[];
  activeId: string;
  onSelect: (id: string) => void;
  onManage: () => void;
}

/**
 * Sits directly under the period bar because it rescopes the whole screen -
 * placement is a claim about scope, and a whole-screen control below the
 * things it changes reads as filtering only what follows it.
 */
function ViewTabs({ views, activeId, onSelect, onManage }: ViewTabsProps) {
  const { t } = useI18n();

  return (
    <section className="view-tabs" aria-label={t('viewTabsLabel')}>
      <div className="view-tabs__row" role="group" aria-label={t('viewTabsLabel')}>
        {/* The All tab is synthesized, so its label follows the user's
            language rather than being frozen into stored data. */}
        <button
          type="button"
          className={`view-tabs__tab ${activeId === ALL_VIEW_ID ? 'active' : ''}`}
          aria-pressed={activeId === ALL_VIEW_ID}
          onClick={() => onSelect(ALL_VIEW_ID)}
        >
          {t('filterAllLabel')}
        </button>

        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`view-tabs__tab ${activeId === view.id ? 'active' : ''}`}
            aria-pressed={activeId === view.id}
            onClick={() => onSelect(view.id)}
          >
            {view.name}
          </button>
        ))}

        <button
          type="button"
          className="view-tabs__manage"
          onClick={onManage}
          aria-label={t('viewManageLabel')}
          title={t('viewManageLabel')}
        >
          ⋯
        </button>
      </div>
    </section>
  );
}

export default memo(ViewTabs);
