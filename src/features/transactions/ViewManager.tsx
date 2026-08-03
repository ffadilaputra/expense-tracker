import { memo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import ViewForm from './ViewForm';
import type { View } from './views';
import type { Transaction } from '../../types';
import './ViewManager.css';

export interface ViewManagerProps {
  views: View[];
  transactions: Transaction[];
  /** Called with the complete new array on every mutation. */
  onSave: (views: View[]) => void;
  onClose: () => void;
}

/** null = list mode; 'new' = adding; a View = editing that one. */
type Editing = null | 'new' | View;

/**
 * Self-contained: the array goes in, a new array comes back on every mutation,
 * and the screen holds one boolean rather than an editor state machine.
 */
function ViewManager({ views, transactions, onSave, onClose }: ViewManagerProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Editing>(null);

  function handleSubmit(view: View) {
    const exists = views.some((v) => v.id === view.id);
    onSave(exists ? views.map((v) => (v.id === view.id ? view : v)) : [...views, view]);
    setEditing(null);
  }

  function handleDelete(view: View) {
    if (!confirm(t('viewDeleteConfirm'))) return;
    onSave(views.filter((v) => v.id !== view.id));
  }

  /** Swaps with the neighbour; the ends are no-ops rather than wrapping. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= views.length) return;
    const next = [...views];
    [next[index], next[target]] = [next[target], next[index]];
    onSave(next);
  }

  if (editing !== null) {
    return (
      <>
        <h2 className="modal__title">
          {editing === 'new' ? t('viewAddTitle') : t('viewEditTitle')}
        </h2>
        <ViewForm
          key={editing === 'new' ? 'new' : editing.id}
          transactions={transactions}
          initialValue={editing === 'new' ? undefined : editing}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
        />
      </>
    );
  }

  return (
    <>
      <h2 className="modal__title">{t('viewManageTitle')}</h2>

      {views.length === 0 ? (
        <p className="view-manager__empty">{t('viewNone')}</p>
      ) : (
        <ul className="view-manager__list">
          {views.map((view, i) => (
            <li key={view.id}>
              <button
                type="button"
                className="view-manager__name"
                onClick={() => setEditing(view)}
              >
                {view.name}
              </button>
              <div className="view-manager__actions">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={t('viewMoveUp')}
                  title={t('viewMoveUp')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === views.length - 1}
                  aria-label={t('viewMoveDown')}
                  title={t('viewMoveDown')}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="view-manager__delete"
                  onClick={() => handleDelete(view)}
                  aria-label={t('deleteBtn')}
                  title={t('deleteBtn')}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button className="btn btn--primary" type="button" onClick={() => setEditing('new')}>
          {t('viewAddBtn')}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onClose}>
          {t('closeBtn')}
        </button>
      </div>
    </>
  );
}

export default memo(ViewManager);
