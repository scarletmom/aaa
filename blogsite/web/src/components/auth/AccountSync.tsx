'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthError, clearVideosPass, joinVideos, refreshAccount, takeVideosDestination, takeVideosPassFromUrl } from '@/lib/auth';
import { moveOwnComments } from '@/lib/comments';
import { canWatchVideos } from '@/lib/roles';
import { clearSession, getSession, saveSession } from '@/lib/session';
import AuthDialog from './AuthDialog';

/**
 * Runs once per full page load: a videos-site pass upgrades the signed-in Member or opens the register dialog,
 * and the session is re-checked with the server.
 */
export default function AccountSync() {
  const router = useRouter();
  const [videosPass, setVideosPass] = useState('');
  // Why this device was just signed out, when the server says (another device took its place).
  const [signedOutNotice, setSignedOutNotice] = useState('');

  useEffect(() => {
    const pass = takeVideosPassFromUrl();
    const session = getSession();

    const goToVideo = () => {
      const destination = takeVideosDestination();
      if (destination) router.replace(destination);
    };

    if (pass) {
      if (session && canWatchVideos(session.role)) goToVideo();
      else if (session) {
        joinVideos(session, pass)
          .then((account) => {
            if (getSession()?.id !== session.id) return;
            clearVideosPass();
            saveSession(account);
            goToVideo();
          })
          .catch(() => { /* an expired pass leaves the account as it was */ });
      } else setVideosPass(pass);
    }

    if (!session) return;
    refreshAccount(session)
      .then((account) => {
        // Skip if the visitor signed out or into another account while this was in flight.
        if (getSession()?.token !== session.token) return;
        moveOwnComments(session.id, account.id);
        saveSession(account);
      })
      .catch((error) => {
        if (!(error instanceof AuthError) || error.status !== 401 || getSession()?.token !== session.token) return;
        clearSession();
        if (error.code === 'device_limit') setSignedOutNotice(error.message);
      });
  }, [router]);

  if (signedOutNotice) {
    return <AuthDialog open onClose={() => setSignedOutNotice('')} initialMode="signIn" notice={signedOutNotice} />;
  }
  return <AuthDialog open={Boolean(videosPass)} onClose={() => setVideosPass('')} initialMode="register" videosPass={videosPass} />;
}
