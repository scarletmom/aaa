import Link from 'next/link';
import { cn } from '@/lib/cn';
import { articleUrl } from '@/lib/format';
import type { StorySummary } from '@/lib/types';
import Meta from '../ui/Meta';
import { headline, summaryText } from '../ui/styles';
import Kicker from './Kicker';
import Media from './Media';
import TimeTag from './TimeTag';

export default function StoryCard({ article, summary = false }: { article: StorySummary; summary?: boolean }) {
  return (
    <article>
      <Link href={articleUrl(article)} className="group">
        <Media image={article.image} alt={article.imageCaption} className="mb-3 aspect-[3/2]" />
        <Kicker article={article} />
        <h3 className={cn('font-serif text-[17.5px] leading-[1.3] font-semibold', headline)}>{article.title}</h3>
      </Link>
      {summary && <p className={cn('mt-1.5 text-[15px]', summaryText)}>{article.summary}</p>}
      <Meta><TimeTag iso={article.publishedAt} /></Meta>
    </article>
  );
}

export function CardRow({ articles }: { articles: StorySummary[] }) {
  return (
    <div className="grid grid-cols-4 gap-6 max-lg:grid-cols-2 max-xs:grid-cols-1">
      {articles.map((a) => <StoryCard key={a.id} article={a} />)}
    </div>
  );
}
