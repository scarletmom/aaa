'use client';

import pricingJson from '@/data/pricing.json';
import { cn } from '@/lib/cn';
import type { Pricing } from '@/lib/subscription';

export const proPricing: Pricing = pricingJson.videos;
export const defaultProPlan = (proPricing.plans.find((plan) => plan.featured) ?? proPricing.plans[0])?.id ?? '';

interface ProPlanPickerProps {
  value: string;
  onChange: (planId: string) => void;
  /** Radio group name; each dialog needs its own. */
  name: string;
}

/** The Member Pro plans from pricing.json as one radio group. */
export default function ProPlanPicker({ value, onChange, name }: ProPlanPickerProps) {
  return (
    <fieldset className="grid gap-2.5">
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
            name={name}
            value={item.id}
            checked={value === item.id}
            onChange={() => onChange(item.id)}
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
              {item.badge && <span className="rounded-full bg-amber-400 px-2 py-px text-[11px] font-bold text-black">{item.badge}</span>}
            </span>
            <span className="text-[13px] text-muted">{item.period}</span>
          </span>
          <span className="font-display text-[22px] font-bold tabular-nums">{item.price}</span>
        </label>
      ))}
    </fieldset>
  );
}
