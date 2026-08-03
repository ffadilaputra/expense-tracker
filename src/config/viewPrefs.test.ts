import { describe, it, expect, beforeEach } from 'vitest';
import { loadViews, saveViews, loadInsightsOpen, saveInsightsOpen } from './viewPrefs';
import type { View } from '../features/transactions/views';

const view: View = { id: 'v1', name: 'Daily needs', categories: ['Food'], type: 'expense' };

beforeEach(() => {
  localStorage.clear();
});

describe('views storage', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(loadViews()).toEqual([]);
  });

  it('round-trips saved views', () => {
    saveViews([view]);
    expect(loadViews()).toEqual([view]);
  });

  it('returns an empty list when the stored value is not JSON', () => {
    localStorage.setItem('finance:views', 'not json');
    expect(loadViews()).toEqual([]);
  });

  it('returns an empty list when the stored value is not an array', () => {
    localStorage.setItem('finance:views', '{"id":"v1"}');
    expect(loadViews()).toEqual([]);
  });

  // One bad entry must not cost the user their other views.
  it('drops corrupt entries and keeps the survivors', () => {
    localStorage.setItem(
      'finance:views',
      JSON.stringify([view, { id: 'broken' }, null, { ...view, id: 'v2', name: 'Income' }])
    );
    expect(loadViews().map((v) => v.id)).toEqual(['v1', 'v2']);
  });
});

describe('insights disclosure state', () => {
  it('defaults to closed', () => {
    expect(loadInsightsOpen()).toBe(false);
  });

  it('round-trips true', () => {
    saveInsightsOpen(true);
    expect(loadInsightsOpen()).toBe(true);
  });

  it('round-trips false', () => {
    saveInsightsOpen(true);
    saveInsightsOpen(false);
    expect(loadInsightsOpen()).toBe(false);
  });
});
