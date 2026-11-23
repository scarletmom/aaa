export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  cta: string;
  badge?: string;
  /** Drawn as the recommended plan. */
  featured?: boolean;
}

/** A pricing.json section: the news site's plans, or the videos site's Pro plans. */
export interface Pricing {
  kicker: string;
  title: string;
  intro: string;
  perks: string[];
  plans: (PricingPlan & { id: string })[];
  /** Shown when a plan is picked while payments aren't connected (the news plans). */
  comingSoon?: string;
}
