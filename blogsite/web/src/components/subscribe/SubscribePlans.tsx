'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { Pricing } from '@/lib/subscription';
import { CheckIcon } from '../ui/Icons';

const solidButton =
  'inline-flex h-11 w-full items-center justify-center rounded-full bg-fg px-5 text-[14.5px] font-semibold text-bg transition-opacity hover:opacity-90';
const outlineButton =
  'inline-flex h-11 w-full items-center justify-center rounded-full border border-line px-5 text-[14.5px] font-semibold transition-colors hover:border-fg';

/** The news site's subscription page. A preview for now: choosing a plan only says subscriptions aren't open. */
export default function SubscribePlans({ siteName, pricing }: { siteName: string; pricing: Pricing }) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <section aria-labelledby="subscribe-title" className="mx-auto max-w-[760px] py-6 sm:py-10">
      <header className="text-center">
        <p className="text-[12px] font-bold tracking-[0.08em] text-accent uppercase">{pricing.kicker}</p>
        <h1 id="subscribe-title" className="mt-2 font-display text-[clamp(32px,5vw,48px)] leading-[1.08]">{pricing.title}</h1>
        <p className="mx-auto mt-3 max-w-[520px] font-serif text-[18px] text-fg-2">
          {siteName}. {pricing.intro}
        </p>
      </header>

      <ul className="mt-7 flex flex-wrap justify-center gap-3">
        {pricing.perks.map((perk) => (
          <li key={perk} className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[15px] font-semibold">
            <CheckIcon size={17} className="flex-none text-up" />
            {perk}
          </li>
        ))}
      </ul>

      <ol className="mt-10 grid gap-4 sm:grid-cols-2">
        {pricing.plans.map((plan) => {
          const featured = Boolean(plan.featured);
          return (
            <li
              key={plan.id}
              className={cn(
                'relative flex flex-col border bg-bg p-6',
                featured ? 'border-fg shadow-[0_10px_30px_rgba(0,0,0,0.1)]' : 'border-line',
              )}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-6 bg-accent px-2.5 py-0.5 text-[11.5px] font-bold text-white">{plan.badge}</span>
              )}
              <h2 className="text-[16px] font-bold">{plan.name}</h2>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-[42px] leading-none font-bold">{plan.price}</span>
                <span className="text-[14px] text-muted">{plan.period}</span>
              </p>
              <ul className="mt-5 mb-6 grid gap-2 text-[14.5px] text-fg-2">
                {pricing.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <CheckIcon size={15} className="flex-none text-up" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setPicked(plan.id)} className={cn('mt-auto', featured ? solidButton : outlineButton)}>
                {plan.cta}
              </button>
              {picked === plan.id && (
                <p role="status" className="mt-3 text-center text-[13.5px] text-muted">{pricing.comingSoon}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
