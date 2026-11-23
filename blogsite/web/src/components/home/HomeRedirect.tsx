'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { videosUrl } from '@/lib/format';
import { canWatchVideos } from '@/lib/roles';
import { useSession } from '@/lib/session';

/** Videos are the home page for accounts that can watch them; the front page stays at /note/. */
export default function HomeRedirect() {
  const session = useSession();
  const router = useRouter();
  const watcher = Boolean(session && canWatchVideos(session.role));

  useEffect(() => {
    if (watcher) router.replace(videosUrl);
  }, [watcher, router]);

  return null;
}
