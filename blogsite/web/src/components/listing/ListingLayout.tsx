import type { ReactNode } from 'react';
import MostReadWidget from '../sidebar/MostReadWidget';
import NewsletterWidget from '../sidebar/NewsletterWidget';
import Sidebar from '../sidebar/Sidebar';
import TrendingWidget from '../sidebar/TrendingWidget';
import PageGrid from '../ui/PageGrid';
import Breadcrumb from './Breadcrumb';

/** Shared frame of the section, topic and search pages: breadcrumb, story column and sidebar. */
export default function ListingLayout({ crumb, children }: { crumb: string; children: ReactNode }) {
  return (
    <>
      <Breadcrumb current={crumb} />
      <PageGrid>
        <div>{children}</div>
        <Sidebar>
          <TrendingWidget />
          <MostReadWidget />
          <NewsletterWidget />
        </Sidebar>
      </PageGrid>
    </>
  );
}
