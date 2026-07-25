import { useCallback, useState } from 'react';
import { clearStoredApiUrl, getStoredApiUrl } from './config/apiUrl';
import { clearCache } from './offline/localCache';
import { useI18n } from './i18n/context';
import LoginScreen from './components/LoginScreen';
import InstallPrompt from './components/InstallPrompt';
import AppShell from './AppShell';

/**
 * Top-level gate: shows the login screen until the user has connected a Google
 * Sheet (a working Apps Script Web App URL), then renders the app. key={apiUrl}
 * forces a full remount when the connected sheet changes, so the store starts
 * fresh against the new sheet.
 */
export default function App() {
  const { t } = useI18n();
  const [apiUrl, setApiUrl] = useState<string | null>(() => getStoredApiUrl());

  const handleConnected = useCallback((url: string) => setApiUrl(url), []);

  const handleChangeSheet = useCallback(() => {
    if (!confirm(t('changeSheetConfirm'))) return;
    clearStoredApiUrl();
    clearCache();
    setApiUrl(null);
  }, [t]);

  return (
    <>
      <InstallPrompt />
      {apiUrl ? (
        <AppShell key={apiUrl} onChangeSheet={handleChangeSheet} />
      ) : (
        <LoginScreen onConnected={handleConnected} />
      )}
    </>
  );
}
