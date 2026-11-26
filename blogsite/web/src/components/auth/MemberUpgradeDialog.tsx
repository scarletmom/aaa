'use client';

import { useState } from 'react';
import { leaveSite, useHoldAds } from '@/lib/ads';
import { ApiError } from '@/lib/api';
import { requestUpgradeLink, type UpgradePlan } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { rememberProPlan } from '@/lib/pro';
import { getSession } from '@/lib/session';
import { CheckIcon } from '../ui/Icons';
import Modal from '../ui/Modal';
import ProPlanPicker, { defaultProPlan, proPricing } from '../videos/ProPlanPicker';

/**
 * A Member picks a Pro plan, or tries Member Lite for free. Either way they pass the videos site's captcha and come
 * back upgraded; for Pro, checkout then opens for the plan picked here.
 */
export default function MemberUpgradeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [planId, setPlanId] = useState(defaultProPlan);
  const [busy, setBusy] = useState<UpgradePlan | null>(null);
  const [error, setError] = useState('');
  const plan = proPricing.plans.find((item) => item.id === planId);
  useHoldAds(open);

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const proceed = async (choice: UpgradePlan) => {
    const session = getSession();
    if (!session) return;
    setBusy(choice);
    setError('');
    try {
      const url = await requestUpgradeLink(session, choice);
      if (choice === 'pro') rememberProPlan(planId);
      leaveSite(url);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The upgrade couldn’t start. Please try again.');
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={close} labelledBy="member-upgrade-title">
      <span className="inline-block rounded-full bg-amber-400 px-2.5 py-0.5 text-[11.5px] font-bold tracking-[0.06em] text-black uppercase">
        {proPricing.kicker}
      </span>
      <h2 id="member-upgrade-title" className="mt-3 font-display text-[30px] leading-[1.1] font-bold">{proPricing.title}</h2>
      <p className="mt-1.5 text-[15.5px] text-fg-2">Every video, without ads. Pick how long you want Pro.</p>

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
          name="member-pro-plan"
          value={planId}
          onChange={(id) => {
            setPlanId(id);
            setError('');
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => proceed('pro')}
        disabled={!plan || Boolean(busy)}
        className="mt-6 h-[52px] w-full rounded-full bg-amber-400 text-[16px] font-semibold text-black transition-colors hover:bg-amber-300 disabled:opacity-50"
      >
        {busy === 'pro' ? 'Opening…' : 'Continue with Pro'}
      </button>
      <button
        type="button"
        onClick={() => proceed('lite')}
        disabled={Boolean(busy)}
        className="mt-2.5 h-12 w-full rounded-full border border-line text-[15px] font-semibold transition-colors hover:border-fg-2 hover:bg-surface-2 disabled:opacity-50"
      >
        {busy === 'lite' ? 'Opening…' : 'Try for free'}
      </button>
      <p role="status" className={cn('mt-3 min-h-[1.4em] text-center text-[13.5px]', error ? 'text-accent' : 'text-muted')}>
        {error || 'Free is Member Lite: every video, with ads. Both start with a quick security check on our videos site.'}
      </p>
    </Modal>
  );
}
