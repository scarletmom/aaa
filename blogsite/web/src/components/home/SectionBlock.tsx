import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { articleUrl, sectionUrl } from '@/lib/format';
import type { Section, StorySummary } from '@/lib/types';
import HeadlineList from '../story/HeadlineList';
import Media from '../story/Media';
import TimeTag from '../story/TimeTag';
import BlockTitle from '../ui/BlockTitle';
import Meta from '../ui/Meta';
import { headline, summaryText } from '../ui/styles';

/** One section on the front page: its newest story with an image, then three more headlines. */
export default function SectionBlock({ section, articles }: { section: Section; articles: StorySummary[] }) {
  const [first, ...more] = articles;
  if (!first) return null;
  const titleId = `block-${section.slug}`;

  return (
    <section aria-labelledby={titleId}>
      <BlockTitle id={titleId} href={sectionUrl(section.slug)}>{section.name}</BlockTitle>
      <article>
        <Link href={articleUrl(first)} className="group">
          <Media image={first.image} alt={first.imageCaption} className="mb-3 aspect-[3/2]" />
          <h3 className={cn('font-serif text-[20px] leading-[1.25] font-bold', headline)}>{first.title}</h3>
        </Link>
        <p className={cn('mt-1.5 text-[15px]', summaryText)}>{first.summary}</p>
        <Meta><TimeTag iso={first.publishedAt} /></Meta>
      </article>
      <HeadlineList articles={more.slice(0, 3)} />
    </section>
  );
}

export function SectionsGrid({ children }: { children: ReactNode }) {
  return <div className="mt-14 grid grid-cols-3 gap-x-10 gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">{children}</div>;
}
