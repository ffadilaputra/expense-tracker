import { useState } from 'react';
import useInstallPrompt from '../hooks/useInstallPrompt';
import { isIosDevice, isMobileDevice } from '../utils/device';
import { useI18n } from '../i18n/context';

const DISMISS_KEY = 'finance:install-dismissed';
const APP_NAME = 'Uang';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Not critical if this fails to persist - the banner just reappears.
  }
}

export default function InstallPrompt() {
  const { t } = useI18n();
  const { isInstallable, isStandalone, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const ios = isIosDevice();

  const shouldShow =
    !isStandalone && !dismissed && isMobileDevice() && (ios || isInstallable);

  if (!shouldShow) return null;

  function dismiss() {
    rememberDismissed();
    setDismissed(true);
  }

  async function handleInstallClick() {
    await promptInstall();
    dismiss();
  }

  return (
    <div className="install-banner" role="note">
      <span className="install-banner__icon" aria-hidden="true">
        📲
      </span>

      <p className="install-banner__text">
        {t(ios ? 'iosInstallText' : 'androidInstallText', { appName: APP_NAME })}
      </p>

      <div className="install-banner__actions">
        {!ios && (
          <button className="btn btn--primary install-banner__install" onClick={handleInstallClick}>
            {t('installBtn')}
          </button>
        )}
        <button className="install-banner__dismiss" onClick={dismiss} aria-label={t('closeBtn')}>
          ✕
        </button>
      </div>
    </div>
  );
}
