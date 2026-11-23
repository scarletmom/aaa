'use client';

import { useEffect, useState } from 'react';
import { holdAdReload, useHoldAds } from '@/lib/ads';
import { refreshAccount } from '@/lib/auth';
import { videosUrl } from '@/lib/format';
import { confirmProPayment } from '@/lib/pro';
import { getSession, saveSession } from '@/lib/session';
import { CheckIcon, WarningIcon } from '../ui/Icons';
import Modal from '../ui/Modal';

const POLL_MS = 2500;
const GIVE_UP_MS = 90 * 1000;
// A checkout with no payment after this long was left without paying.
const UNPAID_AFTER_MS = 8 * 1000;

type Phase = 'waiting' | 'done' | 'slow' | 'failed';

/**
 * Shown on /videos/?pro=<ref> after Dodo's checkout. The server asks Dodo's API how the checkout went
 * (the return URL's own status isn't trusted) and turns the account Pro once it's paid.
 */
export default function ProReturn({ checkoutRef, onSettled }: { checkoutRef: string; onSettled: () => void }) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [open, setOpen] = useState(true);
  useHoldAds(open);

  useEffect(() => {
    if (phase !== 'waiting') onSettled();
  }, [phase, onSettled]);

  useEffect(() => {
    // Once it's settled, drop ?pro=… and Dodo's parameters so a reload doesn't show this again; while it isn't,
    // a reload checks again.
    if (phase === 'done' || phase === 'failed') window.history.replaceState(null, '', videosUrl);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const poll = async () => {
      const session = getSession();
      if (!session) return;
      try {
        const status = await confirmProPayment(checkoutRef, session.token);
        if (stopped) return;
        if (status === 'paid') {
          // The page renews the token on load, so use whatever session is current now, not the one this poll began with.
          const current = getSession();
          // Keep the "You're Pro now" message up; its button reloads to clear the ads already running.
          holdAdReload();
          if (current && current.id === session.id) saveSession(await refreshAccount(current));
          if (!stopped) setPhase('done');
          return;
        }
        if (status === 'failed' || (status === 'unpaid' && Date.now() - started > UNPAID_AFTER_MS)) {
          setPhase('failed');
          return;
        }
      } catch { /* try again on the next tick */ }
      if (stopped) return;
      if (Date.now() - started > GIVE_UP_MS) setPhase('slow');
      else timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [phase, checkoutRef]);

  // Ad scripts that ran before the upgrade keep going until the page reloads.
  const close = () => (phase === 'done' ? window.location.replace(videosUrl) : setOpen(false));

  const message = {
    waiting: { title: 'Finishing your upgrade…', text: 'Your payment is being confirmed. This usually takes a few seconds.' },
    done: { title: 'You’re Pro now', text: 'Thanks for your support! Ads are gone and every Pro feature is unlocked.' },
    slow: {
      title: 'Almost there',
      text: 'Your payment is still being confirmed. Reload this page in a minute to check again.',
    },
    failed: { title: 'Payment didn’t go through', text: 'No payment was taken. You can try again from the Upgrade button.' },
  }[phase];

  return (
    <Modal open={open} onClose={close} dismissible={phase !== 'waiting'} labelledBy="pro-return-title">
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-2xl bg-amber-400 text-black"
      >
        {phase === 'waiting'
          ? <span className="size-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
          : phase === 'done' ? <CheckIcon /> : <WarningIcon />}
      </span>
      <h2 id="pro-return-title" className="mt-4 font-display text-[28px] leading-[1.12] font-bold">{message.title}</h2>
      <p role="status" className="mt-3 text-[15.5px] leading-relaxed text-fg-2">{message.text}</p>
      {phase !== 'waiting' && (
        <button
          type="button"
          onClick={close}
          className="mt-6 h-12 w-full rounded-full bg-amber-400 text-[16px] font-semibold text-black transition-colors hover:bg-amber-300"
        >
          {phase === 'done' ? 'Start watching' : 'OK'}
        </button>
      )}
    </Modal>
  );
}
