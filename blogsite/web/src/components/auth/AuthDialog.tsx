'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useHoldAds } from '@/lib/ads';
import { type Account, readVideosPass, takeVideosDestination } from '@/lib/auth';
import { canWatchVideos } from '@/lib/roles';
import { saveSession } from '@/lib/session';
import { CloseIcon } from '../ui/Icons';
import AuthPanel, { type AuthMode } from './AuthPanel';

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  videosPass?: string;
  /** Shown above the form, e.g. why the visitor was signed out. */
  notice?: string;
}

export default function AuthDialog({ open, onClose, initialMode, videosPass, notice }: AuthDialogProps) {
  // An unconfirmed new key can't be shown again, so only its confirm button may close the dialog.
  const [keyShown, setKeyShown] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  const close = () => {
    setKeyShown(false);
    onClose();
  };
  const dismiss = () => {
    if (!keyShown) close();
  };
  // Videos are the home page for accounts that can watch them; a visitor from the videos site gets the video they picked.
  const signedIn = (account: Account) => {
    close();
    saveSession(account);
    const destination = canWatchVideos(account.role) ? takeVideosDestination() : null;
    if (destination) router.push(destination);
  };

  useHoldAds(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('input')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auth-title"
      onClose={close}
      onCancel={(event) => keyShown && event.preventDefault()}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => event.target === event.currentTarget && dismiss()}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(440px,calc(100%-32px))] max-w-none overflow-y-auto rounded-[28px] border border-line bg-bg text-fg shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop:bg-black/60 backdrop:backdrop-blur-[3px]"
    >
      {open && (
        <div className="relative px-8 pt-10 pb-8 max-xs:px-5">
          <button
            type="button"
            onClick={dismiss}
            hidden={keyShown}
            aria-label="Close"
            className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-surface-2 text-muted hover:text-fg"
          >
            <CloseIcon />
          </button>
          <AuthPanel
            onSignedIn={signedIn}
            onKeyShown={() => setKeyShown(true)}
            initialMode={initialMode}
            notice={notice}
            // A visitor who closed the videos-site register dialog still has the pass for this tab.
            videosPass={videosPass || readVideosPass()}
          />
        </div>
      )}
    </dialog>
  );
}
