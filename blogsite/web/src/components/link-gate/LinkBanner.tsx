'use client';

import type { MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import type { LinkGateSettings } from '@/lib/types';
import { ArrowDownIcon } from '../ui/Icons';
import { GATE_ID } from './LinkGate';
import useLinkGate from './useLinkGate';

const SCROLL_FOCUS_DELAY_MS = 600;

/** The banner above the logo on pages opened with ?token=, pointing down to the gate. */
export default function LinkBanner({ settings }: { settings?: LinkGateSettings }) {
  const gate = useLinkGate(settings);
  if (!gate) return null;
  const { problem, stepText, text } = gate;

  const jump = (event: MouseEvent) => {
    event.preventDefault();
    const box = document.getElementById(GATE_ID);
    if (!box) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    setTimeout(() => box.querySelector('button')?.focus({ preventScroll: true }), smooth ? SCROLL_FOCUS_DELAY_MS : 0);
  };

  return (
    <div
      role="region"
      aria-label="Your link"
      className={cn('border-b', problem ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg')}
    >
      <div className="page-container flex min-h-[150px] flex-col items-center justify-center gap-2 py-5 text-center max-sm:min-h-[128px] max-sm:py-4">
        {stepText && (
          <span className={cn('text-[13px] font-bold', problem ? 'opacity-75' : 'text-up')}>{stepText}</span>
        )}
        <span className="font-serif text-[clamp(20px,2.4vw,26px)] leading-[1.2] font-bold">{problem || text.banner}</span>
        {!problem && (
          <a
            href={`#${GATE_ID}`}
            onClick={jump}
            className="mt-1 inline-flex h-[42px] items-center gap-2 rounded-[2px] bg-link-green px-[22px] text-[15px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-link-green-hover focus-visible:outline-link-green"
          >
            {text.bannerButton}<ArrowDownIcon />
          </a>
        )}
      </div>
    </div>
  );
}
