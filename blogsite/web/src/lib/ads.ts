import { useLayoutEffect, useSyncExternalStore } from 'react';

/**
 * Monetag's push ads live in a service worker (/sw.js) that keeps delivering after the page is gone.
 * Removing it, and its push subscription, is the only way to stop them for someone who has paid.
 */
export async function removeAdPushWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const adWorkers = registrations.filter((registration) =>
    [registration.active, registration.waiting, registration.installing].some((worker) => worker?.scriptURL.endsWith('/sw.js')));
  await Promise.all(adWorkers.map(async (registration) => {
    const subscription = await registration.pushManager.getSubscription().catch(() => null);
    await subscription?.unsubscribe().catch(() => false);
    await registration.unregister();
  }));
}

let holds = 0;
let realOpen: typeof window.open | null = null;
const holdListeners = new Set<() => void>();
// The click that closes a form is still on its way to the ad tag's own listeners when the form closes.
const RELEASE_DELAY_MS = 300;

/**
 * Keeps ads out of the way while a form is open (sign-in, register, upgrade): the tag isn't loaded until it closes, and a
 * tag that already runs can't open its pop-under, which needs window.open. Returns the release.
 */
export function holdAds(): () => void {
  holds += 1;
  if (holds === 1) {
    realOpen = window.open;
    window.open = () => null;
    holdListeners.forEach((listener) => listener());
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    setTimeout(() => {
      holds -= 1;
      if (holds > 0) return;
      if (realOpen) window.open = realOpen;
      realOpen = null;
      holdListeners.forEach((listener) => listener());
    }, RELEASE_DELAY_MS);
  };
}

export const adsHeld = () => holds > 0;

/** Holds ads while `active`. A layout effect, so the hold is in place before ViewerAds' effect in the same commit decides to load the tag. */
export function useHoldAds(active: boolean) {
  useLayoutEffect(() => (active ? holdAds() : undefined), [active]);
}

export function useAdsHeld(): boolean {
  return useSyncExternalStore(
    (listener) => {
      holdListeners.add(listener);
      return () => holdListeners.delete(listener);
    },
    adsHeld,
    () => false,
  );
}

let reloadHeld = false;

/** Stops ViewerAds reloading the page when the viewer turns Pro; the caller reloads at a better moment. */
export function holdAdReload() {
  reloadHeld = true;
}

export const adReloadHeld = () => reloadHeld;
