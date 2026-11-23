import type { Metadata } from 'next';
import SubscribePlans from '@/components/subscribe/SubscribePlans';
import pricing from '@/data/pricing.json';
import { getSiteData } from '@/lib/data';
import type { Pricing } from '@/lib/subscription';

export const metadata: Metadata = { title: 'Subscribe' };

export default async function SubscribePage() {
  const { site } = await getSiteData();
  return <SubscribePlans siteName={site.name} pricing={pricing.news as Pricing} />;
}
