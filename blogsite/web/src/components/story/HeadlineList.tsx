import Link from 'next/link';
import { cn } from '@/lib/cn';
import { articleUrl } from '@/lib/format';
import type { StorySummary } from '@/lib/types';
import { headline } from '../ui/styles';
import TimeTag from './TimeTag';

const VARIANTS = {
  /** Big headlines beside the lead story, time on the same line. */
  headlines: {
    list: '',
    item: 'border-b border-line py-[13px] first:pt-0',
    link: 'text-[18.5px]',
    time: 'ml-2 whitespace-nowrap',
  },
  /** Compact list under a section block or in the sidebar, time on its own line. */
  block: {
    list: 'mt-3.5',
    item: 'border-t border-line py-[11px]',
    link: 'text-[16.5px]',
    time: 'mt-[3px] block',
  },
};

interface HeadlineListProps {
  articles: StorySummary[];
  variant?: keyof typeof VARIANTS;
}

export default function HeadlineList({ articles, variant = 'block' }: HeadlineListProps) {
  const styles = VARIANTS[variant];
  return (
    <ul className={styles.list}>
      {articles.map((a) => (
        <li key={a.id} className={styles.item}>
          <Link href={articleUrl(a)} className={cn('font-serif leading-[1.35]', styles.link, headline)}>{a.title}</Link>
          <TimeTag iso={a.publishedAt} className={styles.time} />
        </li>
      ))}
    </ul>
  );
}
