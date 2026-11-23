import { getSiteData } from '@/lib/data';
import { homeUrl, sectionUrl, videosUrl } from '@/lib/format';
import LinkBanner from '../link-gate/LinkBanner';
import Masthead from './Masthead';
import PrimaryNav, { type NavItem } from './PrimaryNav';
import TopicsBar from './TopicsBar';

export default async function SiteHeader() {
  const { site, articles, t } = await getSiteData();
  const navItems: NavItem[] = [
    { slug: 'home', name: 'Home', href: homeUrl },
    { slug: 'latest', name: t('latestNav', 'Latest'), href: sectionUrl('latest') },
    ...site.sections.map((s) => ({ slug: s.slug, name: s.name, href: sectionUrl(s.slug) })),
    { slug: 'videos', name: t('videos', 'Videos'), href: videosUrl },
  ];
  // Lets the nav highlight a post's section from its address.
  const articleSections = Object.fromEntries(articles.map((a) => [a.id, a.category]));

  return (
    <div id="site-header" className="print:hidden">
      <LinkBanner settings={site.linkGate} />
      <Masthead />
      <PrimaryNav items={navItems} articleSections={articleSections} />
      <TopicsBar />
    </div>
  );
}
