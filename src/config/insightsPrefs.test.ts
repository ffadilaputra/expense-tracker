import { describe, it, expect, beforeEach } from 'vitest';
import { loadInsightsOpen, saveInsightsOpen } from './insightsPrefs';

beforeEach(() => {
  localStorage.clear();
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

  it('treats an unrecognised stored value as closed', () => {
    localStorage.setItem('finance:insights-open', 'yes');
    expect(loadInsightsOpen()).toBe(false);
  });
});
