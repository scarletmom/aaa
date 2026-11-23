'use client';

import { useEffect, useRef } from 'react';
import { useAdFree } from '@/lib/adFree';
import { adReloadHeld, removeAdPushWorker } from '@/lib/ads';
import { useHydrated, useSession } from '@/lib/session';
import AdTag from './AdTag';

/**
 * Monetag's tag for everyone without a valid ad-free pass (Member Pro). Rendered only after hydration: in the static
 * HTML it would run before the page knows who's signed in. A tag that already ran can't be switched off, so turning
 * Pro reloads.
 */
export default function ViewerAds() {
  const hydrated = useHydrated();
  const session = useSession();
  const adFree = useAdFree(session);
  const withAds = adFree === false;
  const adsLoaded = useRef(false);

  useEffect(() => {
    if (!hydrated || adFree === null) return;
    if (withAds) {
      adsLoaded.current = true;
      return;
    }
    removeAdPushWorker().catch(() => {});
    if (adsLoaded.current && !adReloadHeld()) window.location.reload();
  }, [hydrated, adFree, withAds]);

  return hydrated && withAds ? <AdTag /> : null;
}
