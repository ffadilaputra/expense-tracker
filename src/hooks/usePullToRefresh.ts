import { useEffect, useRef, useState } from 'react';

/** Pull distance (px, after resistance) that triggers a refresh on release. */
const TRIGGER_DISTANCE = 70;
/** Cap so the indicator can't be dragged down the whole screen. */
const MAX_PULL = 110;
/**
 * Finger travel is multiplied by this, so the indicator lags the finger.
 * Without it the gesture feels weightless and fires by accident.
 */
const RESISTANCE = 0.5;

export interface PullToRefreshState {
  /** Current pull distance in px, 0 when idle. */
  pullDistance: number;
  /** True while onRefresh is in flight. */
  refreshing: boolean;
  /** True once the user has pulled far enough to trigger on release. */
  willRefresh: boolean;
}

/**
 * Pull-to-refresh for the window scroller.
 *
 * Touch-only by design: it attaches nothing on devices without touch, where
 * the "Sync now" button already covers the same action.
 *
 * Two details this depends on:
 *
 * 1. `touchmove` is registered with `{ passive: false }`. Browsers treat
 *    touch listeners as passive by default, and a passive listener is not
 *    allowed to call preventDefault() - without it the page would scroll (or
 *    rubber-band) underneath the gesture instead of following the indicator.
 *
 * 2. `overscroll-behavior-y: contain` on body (see index.css) suppresses
 *    Chrome on Android's own pull-to-refresh. Otherwise both fire and the
 *    page reloads out from under this one.
 */
export default function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  enabled = true
): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Mirrors of state/props read inside native listeners. The listeners are
  // attached once; reading state directly would capture the values from the
  // render that attached them.
  const startYRef = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    // matchMedia is the reliable touch test; 'ontouchstart' in window reports
    // true in desktop Chrome's device-emulation mode and false on some
    // touch laptops.
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return;

    function reset() {
      startYRef.current = null;
      distanceRef.current = 0;
      setPullDistance(0);
    }

    function handleTouchStart(event: TouchEvent) {
      // Only start from the very top, and ignore pinch/multi-touch.
      if (refreshingRef.current || window.scrollY > 0 || event.touches.length !== 1) {
        startYRef.current = null;
        return;
      }
      startYRef.current = event.touches[0].clientY;
    }

    function handleTouchMove(event: TouchEvent) {
      if (startYRef.current === null || refreshingRef.current) return;

      // Scrolled away from the top mid-gesture: hand control back to the page.
      if (window.scrollY > 0) {
        reset();
        return;
      }

      const delta = event.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        // Pulling upward is an ordinary scroll - don't swallow it.
        if (distanceRef.current !== 0) reset();
        return;
      }

      const distance = Math.min(MAX_PULL, delta * RESISTANCE);
      distanceRef.current = distance;
      setPullDistance(distance);
      // Requires the non-passive registration below.
      event.preventDefault();
    }

    async function handleTouchEnd() {
      if (startYRef.current === null || refreshingRef.current) return;
      const triggered = distanceRef.current >= TRIGGER_DISTANCE;
      reset();
      if (!triggered) return;

      refreshingRef.current = true;
      setRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', reset);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [enabled]);

  return {
    pullDistance,
    refreshing,
    willRefresh: pullDistance >= TRIGGER_DISTANCE
  };
}
