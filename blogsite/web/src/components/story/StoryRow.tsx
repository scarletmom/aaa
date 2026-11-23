import Link from 'next/link';
import { cn } from '@/lib/cn';
import { articleUrl } from '@/lib/format';
import type { StorySummary } from '@/lib/types';
import Meta from '../ui/Meta';
import { headline, summaryText } from '../ui/styles';
import Kicker from './Kicker';
import Media from './Media';
import TimeTag from './TimeTag';

const Byline = ({ article }: { article: StorySummary }) => (
  <Meta>
    <span>By <strong className="font-semibold text-fg-2">{article.author}</strong></span>
    <TimeTag iso={article.publishedAt} />
  </Meta>
);

/** One story in a section list: text on the left, thumbnail on the right. */
export default function StoryRow({ article }: { article: StorySummary }) {
  return (
    <article className="grid grid-cols-[minmax(0,1fr)_220px] gap-6 border-b border-line py-[22px] max-md:grid-cols-[minmax(0,1fr)_112px] max-md:gap-4">
      <div>
        <Kicker article={article} asLink />
        <Link href={articleUrl(article)} className="group">
          <h2 className={cn('font-serif text-[22px] leading-[1.25] font-bold max-md:text-[18px]', headline)}>{article.title}</h2>
        </Link>
        <p className={cn('mt-1.5 text-[16px] max-md:hidden', summaryText)}>{article.summary}</p>
        <Byline article={article} />
      </div>
      <Link href={articleUrl(article)} tabIndex={-1} aria-hidden="true">
        <Media image={article.image} alt={article.imageCaption} />
      </Link>
    </article>
  );
}

/** The first story of a section list, with a large image. */
export function SectionLead({ article }: { article: StorySummary }) {
  return (
    <article className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-7 border-b border-line pb-7 max-md:grid-cols-1">
      <Link href={articleUrl(article)} tabIndex={-1} aria-hidden="true">
        <Media image={article.image} alt={article.imageCaption} eager />
      </Link>
      <div>
        <Kicker article={article} asLink />
        <Link href={articleUrl(article)} className="group">
          <h2 className={cn('font-serif text-[clamp(24px,2.6vw,30px)] leading-[1.18] font-bold', headline)}>{article.title}</h2>
        </Link>
        <p className={cn('mt-2.5 text-[17px]', summaryText)}>{article.summary}</p>
        <Byline article={article} />
      </div>
    </article>
  );
}
