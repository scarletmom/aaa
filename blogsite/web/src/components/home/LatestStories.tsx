import { sectionUrl } from '@/lib/format';
import type { StorySummary } from '@/lib/types';
import { CardRow } from '../story/StoryCard';
import BlockTitle from '../ui/BlockTitle';

export default function LatestStories({ title, articles }: { title: string; articles: StorySummary[] }) {
  if (!articles.length) return null;
  return (
    <section aria-labelledby="latest-title" className="mt-11">
      <BlockTitle id="latest-title" href={sectionUrl('latest')}>{title}</BlockTitle>
      <CardRow articles={articles} />
    </section>
  );
}
