import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ListingLayout from '@/components/listing/ListingLayout';
import SectionIntro from '@/components/listing/SectionIntro';
import StoryList from '@/components/listing/StoryList';
import TeraboxPlayerCard from '@/components/terabox/TeraboxPlayerCard';
import { getSiteData } from '@/lib/data';
import type { Story } from '@/lib/types';

export const dynamicParams = false;

const TERABOX_SECTION = 'terabox';

interface SectionView {
  name: string;
  description: string;
  articles: Story[];
}

/** "latest" lists every post; any other slug is a section from site.json. */
async function getSection(slug: string): Promise<SectionView | null> {
  const { site, articles, t } = await getSiteData();
  if (slug === 'latest') {
    return { name: t('latest', 'Latest'), description: t('latestIntro', ''), articles };
  }
  const section = site.sections.find((s) => s.slug === slug);
  if (!section) return null;
  return { ...section, articles: articles.filter((a) => a.category === slug) };
}

export async function generateStaticParams() {
  const { site } = await getSiteData();
  return [{ slug: 'latest' }, ...site.sections.map((s) => ({ slug: s.slug }))];
}

export async function generateMetadata({ params }: PageProps<'/section/[slug]'>): Promise<Metadata> {
  const section = await getSection((await params).slug);
  return section ? { title: section.name } : {};
}

export default async function SectionPage({ params }: PageProps<'/section/[slug]'>) {
  const { slug } = await params;
  const section = await getSection(slug);
  if (!section) notFound();

  return (
    <ListingLayout crumb={section.name}>
      <SectionIntro heading={section.name} intro={section.description} />
      {slug === TERABOX_SECTION && <TeraboxPlayerCard className="mb-8" />}
      <StoryList articles={section.articles} />
    </ListingLayout>
  );
}
