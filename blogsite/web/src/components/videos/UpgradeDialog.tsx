'use client';

import { useState } from 'react';
import pricingJson from '@/data/pricing.json';
import { useHoldAds } from '@/lib/ads';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { startProCheckout } from '@/lib/pro';
import { getSession } from '@/lib/session';
import type { Pricing } from '@/lib/subscription';
import { CheckIcon } from '../ui/Icons';
import Modal from '../ui/Modal';

export const proPricing: Pricing = pricingJson.videos;
const defaultPlan = (proPricing.plans.find((plan) => plan.featured) ?? proPricing.plans[0])?.id ?? '';

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  /** A Pro pass that ends: the plans add time on top of what's left. */
  extending?: boolean;
}

/** Member Pro plans for the videos page; the button opens Dodo's checkout for the chosen plan. */
export default function UpgradeDialog({ open, onClose, extending = false }: UpgradeDialogProps) {
  const [planId, setPlanId] = useState(defaultPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = proPricing.plans.find((item) => item.id === planId);
  useHoldAds(open);

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const checkout = async () => {
    const token = getSession()?.token;
    if (!plan || !token) return;
    setBusy(true);
    setError('');
    try {
      await startProCheckout(plan.id, token);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The payment page couldn’t be opened. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} labelledBy="upgrade-title">
      <span className="inline-block rounded-full bg-amber-400 px-2.5 py-0.5 text-[11.5px] font-bold tracking-[0.06em] text-black uppercase">
        {proPricing.kicker}
      </span>
      <h2 id="upgrade-title" className="mt-3 font-display text-[30px] leading-[1.1] font-bold">{extending ? 'Extend Pro' : proPricing.title}</h2>
      <p className="mt-1.5 text-[15.5px] text-fg-2">
        {extending ? 'New time is added on top of what you have left.' : proPricing.intro}
      </p>

      <ul className="mt-5 grid gap-2.5 text-[15px]">
        {proPricing.perks.map((perk) => (
          <li key={perk} className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid size-5 flex-none place-items-center rounded-full bg-amber-400 text-black">
              <CheckIcon size={13} />
            </span>
            {perk}
          </li>
        ))}
      </ul>

      <fieldset className="mt-6 grid gap-2.5">
        <legend className="sr-only">Choose a plan</legend>
        {proPricing.plans.map((item) => (
          <label
            key={item.id}
            className={cn(
              'relative flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-fg-2',
              'has-checked:border-amber-400 has-checked:bg-amber-400/10 has-focus-visible:outline-2 has-focus-visible:outline-amber-400',
            )}
          >
            <input
              type="radio"
              name="pro-plan"
              value={item.id}
              checked={planId === item.id}
              onChange={() => {
                setPlanId(item.id);
                setError('');
              }}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="grid size-5 flex-none place-items-center rounded-full border-2 border-line peer-checked:border-amber-400 peer-checked:[&>span]:block"
            >
              <span className="hidden size-2.5 rounded-full bg-amber-400" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 text-[15.5px] font-semibold">
                {item.name}
                {item.badge && (
                  <span className="rounded-full bg-amber-400 px-2 py-px text-[11px] font-bold text-black">{item.badge}</span>
                )}
              </span>
              <span className="text-[13px] text-muted">{item.period}</span>
            </span>
            <span className="font-display text-[22px] font-bold tabular-nums">{item.price}</span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        onClick={checkout}
        disabled={!plan || busy}
        className="mt-6 h-[52px] w-full rounded-full bg-amber-400 text-[16px] font-semibold text-black transition-colors hover:bg-amber-300 disabled:opacity-50"
      >
        {busy ? 'Opening secure checkout…' : (plan?.cta ?? 'Choose a plan')}
      </button>
      <p role="status" className={cn('mt-3 min-h-[1.4em] text-center text-[13.5px]', error ? 'text-accent' : 'text-muted')}>
        {error || 'Secure payment by Dodo Payments. One-time charge, no auto-renewal.'}
      </p>
    </Modal>
  );
}
