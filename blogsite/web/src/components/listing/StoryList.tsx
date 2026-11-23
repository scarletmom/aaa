import Link from 'next/link';
import { sectionUrl } from '@/lib/format';
import type { StorySummary } from '@/lib/types';
import StoryRow, { SectionLead } from '../story/StoryRow';
import LoadMore from './LoadMore';

const PAGE_SIZE = 8;

/** A lead story, then rows of eight with "Load more stories". */
export default function StoryList({ articles }: { articles: StorySummary[] }) {
  const [first, ...rest] = articles;

  if (!first) {
    return (
      <p className="py-10 text-fg-2">
        No stories matched. Try a different search, or browse the{' '}
        <Link href={sectionUrl('latest')} className="text-accent">latest news</Link>.
      </p>
    );
  }

  return (
    <>
      <SectionLead article={first} />
      <LoadMore pageSize={PAGE_SIZE} label="Load more stories">
        {rest.map((a) => <StoryRow key={a.id} article={a} />)}
      </LoadMore>
    </>
  );
}
