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
const holdListeners = new Set<() => void>();
// The click that closes a form is still on its way to the ad tag's own listeners when the form closes.
const RELEASE_DELAY_MS = 300;
/** On <html> while held; globals.css hides whatever the ad tag has put on the page. */
const HELD_ATTRIBUTE = 'data-ads-held';

interface NavigateEventLike extends Event {
  destination: { url: string };
}

let restoreAds: (() => void) | null = null;
// Our own way off the site (checkout, the videos site) while a form is open; anything else foreign is an ad's redirect.
let allowedExit = '';

function blockForeignNavigation(event: Event) {
  const { destination, cancelable } = event as NavigateEventLike;
  if (!cancelable) return;
  const target = new URL(destination.url);
  if (target.origin === window.location.origin || target.href === allowedExit) return;
  event.preventDefault();
}

/** Takes away what a running ad tag uses besides clicks (see guardAdTag): redirects, push prompts and its on-page ads. */
function disableAds(): () => void {
  const notification = 'Notification' in window ? window.Notification : null;
  const realRequestPermission = notification?.requestPermission;
  if (notification) notification.requestPermission = () => Promise.resolve(notification.permission === 'granted' ? 'granted' : 'default');
  const pushManager = 'PushManager' in window ? window.PushManager.prototype : null;
  const realSubscribe = pushManager?.subscribe;
  if (pushManager) pushManager.subscribe = () => Promise.reject(new DOMException('Push is paused while a form is open.', 'NotAllowedError'));

  // The Navigation API (Chromium) can cancel a script's redirect.
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  navigation?.addEventListener('navigate', blockForeignNavigation);

  document.documentElement.setAttribute(HELD_ATTRIBUTE, '');

  return () => {
    if (notification && realRequestPermission) notification.requestPermission = realRequestPermission;
    if (pushManager && realSubscribe) pushManager.subscribe = realSubscribe;
    navigation?.removeEventListener('navigate', blockForeignNavigation);
    document.documentElement.removeAttribute(HELD_ATTRIBUTE);
  };
}

// The gestures a pop-under tag listens for; any one of them can open its tab.
const AD_GESTURES = ['click', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'];
const guardedListeners = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
let tagGuarded = false;

function guardListener(listener: EventListenerOrEventListenerObject): EventListener {
  let guarded = guardedListeners.get(listener);
  if (!guarded) {
    guarded = function (this: unknown, event: Event) {
      if (holds > 0) return;
      return typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event);
    };
    guardedListeners.set(listener, guarded);
  }
  return guarded;
}

/** Routes `document.onclick = …` and the like through the same check. */
function guardHandlerProperty(target: object, key: string) {
  let owner: object | null = target;
  let descriptor: PropertyDescriptor | undefined;
  while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner, key))) owner = Object.getPrototypeOf(owner);
  if (!descriptor?.set || !descriptor.configurable) return;
  let handler: unknown = null;
  descriptor.set.call(target, function (this: unknown, event: Event) {
    if (holds === 0 && typeof handler === 'function') return handler.call(this, event);
  });
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get: () => handler, set: (value) => { handler = value; } });
}

/**
 * Call just before the ad tag loads. A pop-under tag keeps its own copy of window.open and listens for clicks on the
 * page and its links, so swapping things out later is too late. Here every gesture listener added from now on (the
 * tag's; React and Next attach theirs during hydration) and window.open itself do nothing while ads are held.
 */
export function guardAdTag() {
  if (tagGuarded) return;
  tagGuarded = true;

  const realOpen = window.open;
  window.open = function (this: unknown, ...args: Parameters<typeof window.open>) {
    return holds > 0 ? null : realOpen.apply(window, args);
  };

  const proto = EventTarget.prototype;
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;
  proto.addEventListener = function (this: EventTarget, type, listener, options) {
    const guard = listener && AD_GESTURES.includes(type);
    return add.call(this, type, guard ? guardListener(listener) : listener, options);
  };
  proto.removeEventListener = function (this: EventTarget, type, listener, options) {
    return remove.call(this, type, (listener && guardedListeners.get(listener)) || listener, options);
  };

  for (const target of [window, document, document.documentElement, document.body]) {
    for (const gesture of AD_GESTURES) guardHandlerProperty(target, `on${gesture}`);
  }
}

/** Leaves the site on purpose (checkout, the videos site) even while ads are held. */
export function leaveSite(url: string) {
  allowedExit = new URL(url, window.location.href).href;
  window.location.assign(url);
}

/**
 * Turns ads fully off while a form is open (sign-in, register, upgrade): the tag isn't loaded until it closes, and a tag
 * that already runs gets no clicks (no pop-unders, see guardAdTag), can't redirect or ask for push, and its on-page ads
 * are hidden. Returns the release.
 */
export function holdAds(): () => void {
  holds += 1;
  if (holds === 1) {
    restoreAds = disableAds();
    holdListeners.forEach((listener) => listener());
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    setTimeout(() => {
      holds -= 1;
      if (holds > 0) return;
      restoreAds?.();
      restoreAds = null;
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
