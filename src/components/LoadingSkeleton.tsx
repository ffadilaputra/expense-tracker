import { memo } from 'react';
import { useI18n } from '../i18n/context';

/**
 * Shown only on a first load with nothing cached. It mirrors the real layout -
 * summary block, then grouped rows - so the page does not jump when the data
 * arrives.
 */
function LoadingSkeleton() {
  const { t } = useI18n();

  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label={t('loadingGeneric')}>
      <div className="skeleton__bar skeleton__bar--label" />
      <div className="skeleton__bar skeleton__bar--amount" />

      <div className="skeleton__row">
        <div className="skeleton__bar skeleton__bar--stat" />
        <div className="skeleton__bar skeleton__bar--stat" />
      </div>

      <div className="skeleton__bar skeleton__bar--label" />
      {[0, 1, 2, 3].map((i) => (
        <div className="skeleton__card" key={i} />
      ))}

      <span className="skeleton__text">{t('loadingGeneric')}</span>
    </div>
  );
}

export default memo(LoadingSkeleton);
