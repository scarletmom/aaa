import { sectionUrl } from '@/lib/format';
import type { Story, StorySummary } from '@/lib/types';
import { CardRow } from '../story/StoryCard';
import BlockTitle from '../ui/BlockTitle';

export default function RelatedStories({ article, articles }: { article: Story; articles: StorySummary[] }) {
  if (!articles.length) return null;
  return (
    <section aria-labelledby="related-title" className="mt-16 print:hidden">
      <BlockTitle id="related-title" href={sectionUrl(article.category)}>More from {article.sectionName}</BlockTitle>
      <CardRow articles={articles} />
    </section>
  );
}
