import { useEffect, useState } from 'react';
import { isRunningStandalone } from '../utils/device';

// Not yet part of TypeScript's built-in DOM types, so it's declared here.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallPromptState {
  /** True once the browser has offered a native install prompt we can trigger. */
  isInstallable: boolean;
  /** True if the app is already running installed (standalone/home-screen). */
  isStandalone: boolean;
  /** Shows the native install prompt. Resolves once the user has responded. */
  promptInstall: () => Promise<void>;
}

/**
 * Wraps the "beforeinstallprompt" event (Chrome/Edge/Android WebView) that
 * lets a web app offer its own "Add to Home Screen" / "Install" button
 * instead of relying on the browser's own UI. Safari (iOS/macOS) never
 * fires this event - see CameraCapture-style fallback in InstallPrompt.tsx
 * for how iOS is handled instead (manual instructions).
 */
export default function useInstallPrompt(): InstallPromptState {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(isRunningStandalone());

    function handleBeforeInstallPrompt(event: Event) {
      // Stop Chrome's automatic mini-infobar so we can show our own UI
      // on our own terms instead.
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setDeferredEvent(null);
      setIsStandalone(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function promptInstall(): Promise<void> {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    // The prompt can only be used once - discard it either way.
    setDeferredEvent(null);
  }

  return { isInstallable: deferredEvent !== null, isStandalone, promptInstall };
}
