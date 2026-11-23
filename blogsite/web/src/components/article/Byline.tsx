import Link from 'next/link';
import { readTime, searchUrl } from '@/lib/format';
import type { Story } from '@/lib/types';
import TimeTag from '../story/TimeTag';
import Avatar from '../ui/Avatar';
import ShareTools from './ShareTools';

export default function Byline({ article }: { article: Story }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5 border-y border-line py-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={article.author} />
        <div>
          <div className="text-[15px] font-semibold">
            By <Link href={searchUrl(article.author)} className="hover:text-accent">{article.author}</Link>, {article.authorRole}
          </div>
          <div className="text-[13px] text-muted">
            <TimeTag iso={article.publishedAt} full />
            {' '}· {readTime(article.body)} min read
          </div>
        </div>
      </div>
      <ShareTools title={article.title} />
    </div>
  );
}
