import type { StorySummary } from '@/lib/types';
import HeadlineList from '../story/HeadlineList';
import BlockTitle from '../ui/BlockTitle';

export default function LatestWidget({ articles }: { articles: StorySummary[] }) {
  return (
    <section aria-labelledby="latest-side-title">
      <BlockTitle id="latest-side-title">Latest</BlockTitle>
      <HeadlineList articles={articles} />
    </section>
  );
}
