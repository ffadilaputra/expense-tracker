import { useState, type FormEvent } from 'react';
import { isValidAppsScriptUrl, setStoredApiUrl } from '../config/apiUrl';
import { verifyApiUrl } from '../api/sheetApi';
import { useI18n } from '../i18n/context';
import LanguageSwitch from './LanguageSwitch';

interface LoginScreenProps {
  onConnected: (url: string) => void;
}

export default function LoginScreen({ onConnected }: LoginScreenProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    setError(null);

    if (!isValidAppsScriptUrl(trimmed)) {
      setError(t('invalidUrlError'));
      return;
    }

    setChecking(true);
    try {
      await verifyApiUrl(trimmed);
      setStoredApiUrl(trimmed);
      onConnected(trimmed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="lang-switch-row">
          <LanguageSwitch />
        </div>

        <h1>{t('appTitle')}</h1>
        <p className="login-card__tagline">{t('loginTagline')}</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            {t('webAppUrlLabel')}
            <input
              type="url"
              inputMode="url"
              placeholder="https://script.google.com/macros/s/xxxxxxxx/exec"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </label>
          <button className="btn btn--primary" type="submit" disabled={checking}>
            {checking ? t('connecting') : t('connectBtn')}
          </button>
        </form>

        {error && <p className="login-card__error">{error}</p>}

        <details className="login-card__help">
          <summary>{t('helpSummary')}</summary>
          <ol>
            <li>{t('helpStep1')}</li>
            <li>{t('helpStep2')}</li>
            <li>{t('helpStep3')}</li>
            <li>{t('helpStep4')}</li>
          </ol>
        </details>
      </div>
    </div>
  );
}
