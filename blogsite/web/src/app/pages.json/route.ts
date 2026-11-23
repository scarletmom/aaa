import { getPlayerData, getSiteData } from '@/lib/data';
import { articleUrl, sectionUrl, tagUrl } from '@/lib/format';

// Written to out/pages.json at build time. The video server picks random pages from it for link-gate steps.
export const dynamic = 'force-static';

export async function GET() {
  const [{ site, articles }, player] = await Promise.all([getSiteData(), getPlayerData()]);
  const pages = [
    { slug: '/', title: site.name },
    { slug: '/player/', title: player.title },
    ...site.sections.map((section) => ({ slug: sectionUrl(section.slug), title: section.name })),
    ...site.topics.map((topic) => ({ slug: tagUrl(topic), title: topic })),
    ...articles.map((article) => ({ slug: articleUrl(article), title: article.title })),
  ];
  return Response.json(pages);
}
