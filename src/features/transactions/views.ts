import { normalizeCategory } from './categoryChips';
import type { Transaction } from '../../types';

/** Which side of the ledger a view looks at. */
export type ViewType = 'all' | 'expense' | 'income';

/**
 * A named, reusable filter - the thing the transient chip row cannot express.
 * An empty `categories` list means every category of `type`, so an "Income"
 * view keeps working when a new income category is invented next month.
 */
export interface View {
  id: string;
  name: string;
  categories: string[];
  type: ViewType;
}

export const ALL_VIEW_ID = 'all';

/**
 * The unfiltered first tab. Synthesized rather than stored, so it cannot be
 * renamed, deleted or corrupted. `name` is empty on purpose: the tab bar
 * renders a translated label for this id, so it follows the user's language
 * instead of freezing whichever one was active when it was created.
 */
export const ALL_VIEW: View = { id: ALL_VIEW_ID, name: '', categories: [], type: 'all' };

const TYPES: ViewType[] = ['all', 'expense', 'income'];

export function makeViewId(): string {
  return `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Narrows by type, then by category if any are listed.
 *
 * Only the transaction side is normalized. View entries are stored exactly as
 * the picker supplied them - already normalized - because UNCATEGORIZED
 * carries a deliberate leading space that trimming would destroy, silently
 * unclaiming every blank-category row.
 */
export function applyView(txns: Transaction[], view: View): Transaction[] {
  const byType = view.type === 'all' ? txns : txns.filter((t) => t.type === view.type);
  if (view.categories.length === 0) return byType;

  const claimed = new Set(view.categories);
  return byType.filter((t) => claimed.has(normalizeCategory(t.category)));
}

/**
 * localStorage is the one input the user can hand-edit and that survives across
 * app versions, so anything malformed degrades to "that view is gone" rather
 * than taking the tab bar down with it.
 */
export function normalizeView(raw: unknown): View | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;

  if (typeof v.id !== 'string' || v.id === '') return null;
  if (typeof v.name !== 'string' || v.name.trim() === '') return null;
  if (!Array.isArray(v.categories)) return null;
  if (typeof v.type !== 'string' || !TYPES.includes(v.type as ViewType)) return null;

  return {
    id: v.id,
    name: v.name.trim(),
    categories: v.categories.filter((c): c is string => typeof c === 'string' && c !== ''),
    type: v.type as ViewType
  };
}
