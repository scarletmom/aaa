'use client';

import { useEffect, useRef, useState } from 'react';
import { useHoldAds } from '@/lib/ads';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { startProCheckout } from '@/lib/pro';
import { getSession } from '@/lib/session';
import { CheckIcon } from '../ui/Icons';
import Modal from '../ui/Modal';
import ProPlanPicker, { defaultProPlan, proPricing } from './ProPlanPicker';


interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  /** A Pro pass that ends: the plans add time on top of what's left. */
  extending?: boolean;
  /** A plan already picked (before the videos site's captcha): checkout opens for it as soon as the dialog does. */
  checkoutPlan?: string;
}

/** Member Pro plans for the videos page; the button opens Dodo's checkout for the chosen plan. */
export default function UpgradeDialog({ open, onClose, extending = false, checkoutPlan = '' }: UpgradeDialogProps) {
  const [planId, setPlanId] = useState(defaultProPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = proPricing.plans.find((item) => item.id === planId);
  useHoldAds(open);

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const checkout = async (id = planId) => {
    const token = getSession()?.token;
    if (!proPricing.plans.some((item) => item.id === id) || !token) return;
    setBusy(true);
    setError('');
    try {
      await startProCheckout(id, token);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The payment page couldn’t be opened. Please try again.');
      setBusy(false);
    }
  };

  const startedFor = useRef('');
  useEffect(() => {
    if (!open || !checkoutPlan || startedFor.current === checkoutPlan) return;
    startedFor.current = checkoutPlan;
    if (!proPricing.plans.some((item) => item.id === checkoutPlan)) return;
    setPlanId(checkoutPlan);
    checkout(checkoutPlan);
  });

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

      <div className="mt-6">
        <ProPlanPicker
          name="pro-plan"
          value={planId}
          onChange={(id) => {
            setPlanId(id);
            setError('');
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => checkout()}
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
