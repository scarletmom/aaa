import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ListingLayout from '@/components/listing/ListingLayout';
import SectionIntro from '@/components/listing/SectionIntro';
import StoryList from '@/components/listing/StoryList';
import { getSiteData, getTags } from '@/lib/data';

export const dynamicParams = false;

export async function generateStaticParams() {
  return [...(await getTags()).keys()].map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: PageProps<'/topic/[tag]'>): Promise<Metadata> {
  const tag = (await getTags()).get((await params).tag);
  return tag ? { title: tag } : {};
}

export default async function TopicPage({ params }: PageProps<'/topic/[tag]'>) {
  const tag = (await getTags()).get((await params).tag);
  if (!tag) notFound();

  const { articles, t } = await getSiteData();
  const tagged = articles.filter((a) => a.tags.some((x) => x.toLowerCase() === tag.toLowerCase()));

  return (
    <ListingLayout crumb={t('topics', 'Topics')}>
      <SectionIntro heading={tag} intro={`Coverage tagged “${tag}”.`} />
      <StoryList articles={tagged} />
    </ListingLayout>
  );
}
