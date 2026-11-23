'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { syncLinkQuery } from '@/lib/linkQuery';

/** Reports every page change (full load or in-app) to the link-query store. Render inside <Suspense>. */
export default function NavigationTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => { syncLinkQuery(); }, [pathname, search]);
  return null;
}
