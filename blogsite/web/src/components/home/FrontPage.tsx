import { getSiteData } from '@/lib/data';
import LatestStories from './LatestStories';
import SectionBlock, { SectionsGrid } from './SectionBlock';
import TopStories from './TopStories';
import UpdatesStrip from './UpdatesStrip';
import AppLinksWidget from '../sidebar/AppLinksWidget';
import MostReadWidget from '../sidebar/MostReadWidget';
import NewsletterWidget from '../sidebar/NewsletterWidget';
import Sidebar from '../sidebar/Sidebar';
import TrendingWidget from '../sidebar/TrendingWidget';
import PageGrid from '../ui/PageGrid';

// Release notes get their own strip under the top stories instead of a block in the grid.
const UPDATES_SECTION = 'updates';

export default async function FrontPage() {
  const { articles, site, sectionNames, t } = await getSiteData();
  const lead = articles.find((a) => a.featured) ?? articles[0];
  const [second, ...queue] = articles.filter((a) => a !== lead);
  const updates = articles.filter((a) => a.category === UPDATES_SECTION).slice(0, 3);
  const blockSections = site.sections.filter((s) => s.slug !== UPDATES_SECTION);

  return (
    <>
      <PageGrid>
        <div>
          <h1 className="mb-6 border-b-2 border-line pb-3 font-sans text-[28px] font-bold tracking-[-0.01em]">
            {t('featured', 'Featured')}
          </h1>
          {lead && <TopStories lead={lead} second={second} headlines={queue.slice(0, 8)} />}
          <LatestStories title={t('latest', 'Latest')} articles={queue.slice(8, 12)} />
        </div>
        <Sidebar>
          <AppLinksWidget />
          <TrendingWidget />
          <MostReadWidget />
          <NewsletterWidget />
        </Sidebar>
      </PageGrid>

      <UpdatesStrip section={UPDATES_SECTION} title={sectionNames[UPDATES_SECTION] || 'Updates'} articles={updates} />

      <SectionsGrid>
        {blockSections.map((section) => (
          <SectionBlock key={section.slug} section={section} articles={articles.filter((a) => a.category === section.slug)} />
        ))}
      </SectionsGrid>
    </>
  );
}
