'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { fetchLink, fill, isExpired } from '@/lib/linkGate';
import type { LinkGateSettings } from '@/lib/types';
import useLinkGate, { type PageGate } from './useLinkGate';

export const GATE_ID = 'link-gate';

type Phase = 'start' | 'waiting' | 'ready' | 'loading' | 'redirecting' | 'failed' | 'expired';

/** Shown at the bottom of any page opened with ?token=; it starts over on every page. */
export default function LinkGate({ settings }: { settings?: LinkGateSettings }) {
  const gate = useLinkGate(settings);
  return gate ? <LinkGateBox key={`${gate.path}|${gate.token}`} gate={gate} /> : null;
}

// start → waiting (countdown) → ready → loading → redirecting, or failed (retry) / expired.
function LinkGateBox({ gate }: { gate: PageGate }) {
  const { problem, stepText, text, seconds, payload } = gate;
  const [phase, setPhase] = useState<Phase>('start');
  const [remaining, setRemaining] = useState(seconds);
  const [status, setStatus] = useState({ message: '', isError: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusWhenReady = useRef(false);

  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    if (remaining <= 0) {
      focusWhenReady.current = true;
      setPhase('ready');
      return undefined;
    }
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, remaining]);

  useEffect(() => {
    if (phase === 'ready' && focusWhenReady.current) {
      focusWhenReady.current = false;
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [phase]);

  const start = () => {
    if (!seconds) {
      setPhase('ready');
      return;
    }
    setRemaining(seconds);
    setPhase('waiting');
  };

  const getLink = async () => {
    setPhase('loading');
    setStatus({ message: text.loading, isError: false });
    if (isExpired(payload)) {
      setPhase('expired');
      setStatus({ message: text.expired, isError: true });
      return;
    }
    const result = await fetchLink(gate);
    if ('target' in result) {
      setPhase('redirecting');
      setStatus({ message: text.redirecting, isError: false });
      window.location.assign(result.target.href);
      return;
    }
    setPhase('failed');
    setStatus({ message: result.error, isError: true });
  };

  const waiting = phase === 'waiting';
  const message = waiting ? fill(text.waiting, { s: remaining }) : status.message;
  const buttons: Partial<Record<Phase, { label: string; onClick?: () => void; disabled?: boolean }>> = {
    start: { label: text.start, onClick: start },
    ready: { label: text.get, onClick: getLink },
    failed: { label: text.retry, onClick: getLink },
    loading: { label: text.get, disabled: true },
    redirecting: { label: text.get, disabled: true },
  };
  const button = problem ? undefined : buttons[phase];

  return (
    <section
      id={GATE_ID}
      aria-labelledby="link-gate-title"
      className="mx-auto mt-16 max-w-[620px] scroll-mt-20 border border-t-[3px] border-line border-t-link-green bg-surface px-7 pt-[34px] pb-[30px] text-center max-sm:mt-11 max-sm:px-[18px] max-sm:pt-[26px] max-sm:pb-6"
    >
      {stepText && <span className="mb-1.5 inline-block font-sans text-[13px] font-semibold text-up">{stepText}</span>}
      <h2 id="link-gate-title" className="font-serif text-[clamp(24px,3vw,30px)] leading-[1.2] font-bold">{text.title}</h2>
      <p className="mt-2 text-[16px] text-fg-2">{problem || text.intro}</p>
      {button && (
        <div className="mt-[22px] flex justify-center">
          <button
            ref={buttonRef}
            type="button"
            onClick={button.onClick}
            disabled={button.disabled}
            className="inline-flex h-12 items-center justify-center rounded-[2px] border border-link-green bg-link-green px-8 text-[16px] font-semibold whitespace-nowrap text-white focus-visible:outline-link-green enabled:hover:border-link-green-hover enabled:hover:bg-link-green-hover disabled:cursor-progress disabled:opacity-60"
          >
            {button.label}
          </button>
        </div>
      )}
      <div hidden={!waiting} className="mx-auto mt-6 h-1.5 max-w-[360px] overflow-hidden rounded-[3px] bg-surface-2">
        <span
          className="block h-full bg-link-green transition-[width] duration-1000 ease-linear"
          style={{ width: `${seconds ? ((seconds - remaining) / seconds) * 100 : 0}%` }}
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        className={cn('mt-3 min-h-[1.5em] text-[15px] tabular-nums', status.isError && !waiting ? 'text-accent' : 'text-fg-2')}
      >
        {!problem && message}
      </p>
    </section>
  );
}
