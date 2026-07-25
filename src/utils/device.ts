// Detects if the PWA is running in standalone/installed mode (home-screen app,
// not browser tab).
export function isRunningStandalone(): boolean {
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}
