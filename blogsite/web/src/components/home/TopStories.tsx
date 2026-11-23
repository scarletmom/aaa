import Link from 'next/link';
import { cn } from '@/lib/cn';
import { articleUrl, readTime } from '@/lib/format';
import type { Story } from '@/lib/types';
import HeadlineList from '../story/HeadlineList';
import Kicker from '../story/Kicker';
import Media from '../story/Media';
import TimeTag from '../story/TimeTag';
import Meta from '../ui/Meta';
import { headline, summaryText } from '../ui/styles';

function LeadStory({ article }: { article: Story }) {
  return (
    <article>
      <Kicker article={article} asLink />
      <Link href={articleUrl(article)} className="group">
        <h2 className={cn('font-serif text-[clamp(26px,2.6vw,32px)] leading-[1.15] font-bold tracking-[-0.01em]', headline)}>
          {article.title}
        </h2>
      </Link>
      <Meta><TimeTag iso={article.publishedAt} /></Meta>
      <Link href={articleUrl(article)} tabIndex={-1} aria-hidden="true">
        <Media image={article.image} alt={article.imageCaption} eager className="mt-3 aspect-[3/2]" />
      </Link>
      <p className={cn('mt-3.5 text-[17px] leading-[1.55]', summaryText)}>{article.summary}</p>
      <p className="mt-2.5 text-[13px] text-muted">
        By <strong className="font-semibold text-fg">{article.author}</strong> · {readTime(article.body)} min read
      </p>
    </article>
  );
}

function SecondStory({ article }: { article: Story }) {
  return (
    <article className="mt-[22px] border-t border-line pt-[18px]">
      <Kicker article={article} asLink />
      <Link href={articleUrl(article)} className="group">
        <h3 className={cn('font-serif text-[24px] leading-[1.22] font-semibold', headline)}>{article.title}</h3>
      </Link>
      <p className={cn('mt-2 text-[16px]', summaryText)}>{article.summary}</p>
      <Meta><TimeTag iso={article.publishedAt} /></Meta>
    </article>
  );
}

interface TopStoriesProps {
  lead: Story;
  second?: Story;
  headlines: Story[];
}

/** The lead story with a second story under it, and a column of headlines beside them. */
export default function TopStories({ lead, second, headlines }: TopStoriesProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-8 max-md:grid-cols-1">
      <div>
        <LeadStory article={lead} />
        {second && <SecondStory article={second} />}
      </div>
      <HeadlineList articles={headlines} variant="headlines" />
    </div>
  );
}
