// Small user-agent based checks. These are only used to decide whether to
// show the "Add to Home Screen" banner and which variant of it to show -
// nothing security- or functionality-critical depends on them.

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ reports itself as "Macintosh" but exposes touch support,
  // which real Macs don't - this catches iPads too, not just iPhone/iPod.
  const ua = navigator.userAgent;
  const isClassicIos = /iphone|ipad|ipod/i.test(ua);
  const isIpadOs13Plus = ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
  return isClassicIos || isIpadOs13Plus;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIosDevice() || /android/i.test(navigator.userAgent);
}

/** True once the app is already running as an installed/standalone app. */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari's non-standard way of reporting the same thing.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isDisplayModeStandalone || iosStandalone;
}
