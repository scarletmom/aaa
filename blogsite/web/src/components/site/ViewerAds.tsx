'use client';

import { useEffect, useState } from 'react';
import { useAdFree } from '@/lib/adFree';
import { adReloadHeld, adsHeld, removeAdPushWorker, useAdsHeld } from '@/lib/ads';
import { useHydrated, useSession } from '@/lib/session';
import AdTag from './AdTag';

/**
 * Monetag's tag for everyone without a valid ad-free pass (Member Pro). Rendered only after hydration: in the static
 * HTML it would run before the page knows who's signed in. It also waits while a sign-in form is open. A tag that
 * already ran can't be switched off, so turning Pro reloads.
 */
export default function ViewerAds() {
  const hydrated = useHydrated();
  const session = useSession();
  const adFree = useAdFree(session);
  const withAds = adFree === false;
  const held = useAdsHeld();
  const [tagLoaded, setTagLoaded] = useState(false);

  useEffect(() => {
    if (!hydrated || adFree === null) return;
    if (withAds) {
      // Read live: a form opened in this same commit holds ads before this effect runs.
      if (!adsHeld()) setTagLoaded(true);
      return;
    }
    removeAdPushWorker().catch(() => {});
    if (tagLoaded && !adReloadHeld()) window.location.reload();
  }, [hydrated, adFree, withAds, held, tagLoaded]);

  return tagLoaded && withAds ? <AdTag /> : null;
}
