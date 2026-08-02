import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import {
  applyTheme,
  getStoredAccent,
  getStoredAppearance,
  setStoredAccent,
  setStoredAppearance
} from '../config/theme';
import { DEFAULT_ACCENT, PRESET_ACCENTS, type Appearance } from '../utils/theme';
import './ThemePanel.css';

const APPEARANCES: Appearance[] = ['system', 'light', 'dark'];

interface ThemePanelProps {
  onClose: () => void;
}

export default function ThemePanel({ onClose }: ThemePanelProps) {
  const { t } = useI18n();
  const [accent, setAccent] = useState(() => getStoredAccent());
  const [appearance, setAppearance] = useState<Appearance>(() => getStoredAppearance());

  // Applied as it changes so the whole app is the preview, then persisted.
  useEffect(() => {
    applyTheme(accent, appearance);
    setStoredAccent(accent);
    setStoredAppearance(appearance);
  }, [accent, appearance]);

  // On "system", the resolved mode can change under us while the panel is open.
  useEffect(() => {
    if (appearance !== 'system') return;
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = () => applyTheme(accent, 'system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [accent, appearance]);

  const reset = useCallback(() => setAccent(DEFAULT_ACCENT), []);

  return (
    <div className="theme-panel">
      <section className="theme-panel__section">
        <h3 className="theme-panel__heading">{t('themeAppearance')}</h3>
        <div className="theme-panel__modes" role="group" aria-label={t('themeAppearance')}>
          {APPEARANCES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`theme-panel__mode ${appearance === mode ? 'active' : ''}`}
              aria-pressed={appearance === mode}
              onClick={() => setAppearance(mode)}
            >
              {t(mode === 'system' ? 'themeSystem' : mode === 'light' ? 'themeLight' : 'themeDark')}
            </button>
          ))}
        </div>
      </section>

      <section className="theme-panel__section">
        <h3 className="theme-panel__heading">{t('themeAccent')}</h3>
        <div className="theme-panel__swatches" role="group" aria-label={t('themeAccent')}>
          {PRESET_ACCENTS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`theme-panel__swatch ${accent.toLowerCase() === preset ? 'active' : ''}`}
              style={{ background: preset }}
              aria-label={preset}
              aria-pressed={accent.toLowerCase() === preset}
              onClick={() => setAccent(preset)}
            />
          ))}
        </div>

        <label className="theme-panel__custom">
          {t('themeCustom')}
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
        </label>

        <p className="theme-panel__note">{t('themeContrastNote')}</p>
      </section>

      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t('closeBtn')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={reset}>
          {t('themeReset')}
        </button>
      </div>
    </div>
  );
}
