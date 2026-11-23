import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ArticleBody from '@/components/article/ArticleBody';
import RelatedStories from '@/components/article/RelatedStories';
import StoryHeader from '@/components/article/StoryHeader';
import TagList from '@/components/article/TagList';
import Breadcrumb from '@/components/listing/Breadcrumb';
import LatestWidget from '@/components/sidebar/LatestWidget';
import MostReadWidget from '@/components/sidebar/MostReadWidget';
import NewsletterWidget from '@/components/sidebar/NewsletterWidget';
import Sidebar from '@/components/sidebar/Sidebar';
import PageGrid from '@/components/ui/PageGrid';
import { getArticle, getSiteData } from '@/lib/data';
import { sectionUrl } from '@/lib/format';

export const dynamicParams = false;

export async function generateStaticParams() {
  const { articles } = await getSiteData();
  return articles.map((article) => ({ id: article.id }));
}

export async function generateMetadata({ params }: PageProps<'/article/[id]'>): Promise<Metadata> {
  const article = await getArticle((await params).id);
  return article ? { title: article.title, description: article.summary } : {};
}

export default async function ArticlePage({ params }: PageProps<'/article/[id]'>) {
  const article = await getArticle((await params).id);
  if (!article) notFound();

  const { articles, t } = await getSiteData();
  const others = articles.filter((a) => a.id !== article.id);
  const related = [
    ...others.filter((a) => a.category === article.category),
    ...others.filter((a) => a.category !== article.category),
  ].slice(0, 4);

  return (
    <>
      <Breadcrumb trail={[{ href: sectionUrl(article.category), label: article.sectionName }]} current={article.title} />
      <PageGrid>
        <article className="max-w-[760px]">
          <StoryHeader article={article} />
          <ArticleBody body={article.body} />
          <TagList label={t('topics', 'Topics')} tags={article.tags} />
        </article>
        <Sidebar>
          <MostReadWidget />
          <LatestWidget articles={others.slice(0, 5)} />
          <NewsletterWidget />
        </Sidebar>
      </PageGrid>
      <RelatedStories article={article} articles={related} />
    </>
  );
}
