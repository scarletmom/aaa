'use client';

import { useEffect, useState } from 'react';
import { type AdBlockResult, detectAdBlock } from '@/lib/adBlock';
import { WarningIcon } from '../ui/Icons';
import Modal from '../ui/Modal';
import { proPricing } from './ProPlanPicker';

const amount = (price: string) => Number(price.replace(/[^0-9.]/g, '')) || Infinity;
const cheapest = proPricing.plans.reduce<string>(
  (best, plan) => (amount(plan.price) < amount(best) ? plan.price : best),
  proPricing.plans[0]?.price ?? '',
);

export type AdBlockCheck = { status: 'off' | 'checking' | 'clear' } | { status: 'blocked'; brave: boolean };

/** While `enabled`, whether ads are blocked on this page load. */
export function useAdBlockCheck(enabled: boolean): AdBlockCheck {
  const [result, setResult] = useState<AdBlockResult | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    detectAdBlock().then((found) => !cancelled && setResult(found));
    return () => { cancelled = true; };
  }, [enabled]);

  if (!enabled) return { status: 'off' };
  if (!result) return { status: 'checking' };
  return result.blocked ? { status: 'blocked', brave: result.brave } : { status: 'clear' };
}

/** Blocks the videos until ads are allowed or the viewer goes Pro; the Pro plans open on top of it. */
export default function AdBlockDialog({ check, onUpgrade }: { check: AdBlockCheck; onUpgrade: () => void }) {
  const brave = check.status === 'blocked' && check.brave;

  return (
    <Modal open={check.status === 'blocked'} onClose={() => {}} dismissible={false} labelledBy="adblock-title">
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-amber-400 text-black">
        <WarningIcon />
      </span>
      <h2 id="adblock-title" className="mt-4 font-display text-[28px] leading-[1.12] font-bold">
        Ad blocker detected
      </h2>
      <p className="mt-2 text-[15.5px] leading-relaxed text-fg-2">
        Ads keep these videos free. {brave ? 'Click the lion icon, turn Shields off, then reload.' : 'Pause your ad blocker here, then reload.'}
      </p>

      <div className="mt-6 grid gap-2.5">
        <button
          type="button"
          onClick={onUpgrade}
          className="h-[52px] w-full rounded-full bg-amber-400 text-[16px] font-semibold text-black transition-colors hover:bg-amber-300"
        >
          Go ad-free from {cheapest}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-12 w-full rounded-full border border-line text-[15px] font-semibold transition-colors hover:border-fg"
        >
          Reload
        </button>
      </div>
    </Modal>
  );
}
