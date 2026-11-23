import type { ReactNode } from 'react';
import LinkGate from '@/components/link-gate/LinkGate';
import { getSiteData } from '@/lib/data';
import SiteFooter from './SiteFooter';
import SiteHeader from './SiteHeader';
import ViewerAds from './ViewerAds';

/** The news site's masthead, nav and footer around a page. */
export default async function NewsChrome({ children }: { children: ReactNode }) {
  const { site } = await getSiteData();
  return (
    <>
      <ViewerAds />
      <a href="#main" className="absolute -top-10 left-3 z-10 bg-fg px-3 py-2 text-bg focus:top-3">Skip to content</a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="page-container pt-7 pb-16 outline-none">
        {children}
        <LinkGate settings={site.linkGate} />
      </main>
      <SiteFooter />
    </>
  );
}
