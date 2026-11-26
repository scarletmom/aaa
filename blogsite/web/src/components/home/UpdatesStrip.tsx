import Link from 'next/link';
import { cn } from '@/lib/cn';
import { articleUrl, sectionUrl } from '@/lib/format';
import type { StorySummary } from '@/lib/types';
import Avatar from '../ui/Avatar';
import BlockTitle from '../ui/BlockTitle';
import { headline, summaryText } from '../ui/styles';

function UpdateCard({ article }: { article: StorySummary }) {
  return (
    <article
      className={cn(
        'border-l border-line px-7 py-1 first:border-l-0 first:pl-0',
        'max-md:border-t max-md:border-l-0 max-md:px-0 max-md:py-[18px] max-md:first:border-t-0 max-md:first:pt-1',
      )}
    >
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={article.author} />
        <div>
          <div className="text-[14px] font-semibold">{article.author}</div>
          <div className="text-[13px] text-muted">{article.authorRole}</div>
        </div>
      </div>
      <Link href={articleUrl(article)} className="group">
        <h3 className={cn('font-serif text-[21px] leading-[1.25] font-semibold', headline)}>{article.title}</h3>
      </Link>
      <p className={cn('mt-2 text-[15.5px]', summaryText)}>{article.summary}</p>
    </article>
  );
}

interface UpdatesStripProps {
  section: string;
  title: string;
  articles: StorySummary[];
}

/** Three posts side by side, each under its author, linking to the full section. */
export default function UpdatesStrip({ section, title, articles }: UpdatesStripProps) {
  if (!articles.length) return null;
  return (
    <section aria-labelledby="updates-title" className="mt-14">
      <BlockTitle id="updates-title" href={sectionUrl(section)}>{title}</BlockTitle>
      <div className="grid grid-cols-3 max-md:grid-cols-1">
        {articles.map((a) => <UpdateCard key={a.id} article={a} />)}
      </div>
    </section>
  );
}
