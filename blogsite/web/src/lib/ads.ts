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

let reloadHeld = false;

/** Stops ViewerAds reloading the page when the viewer turns Pro; the caller reloads at a better moment. */
export function holdAdReload() {
  reloadHeld = true;
}

export const adReloadHeld = () => reloadHeld;
