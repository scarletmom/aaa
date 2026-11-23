import Link from 'next/link';
import { cn } from '@/lib/cn';
import { sectionUrl } from '@/lib/format';
import type { StorySummary } from '@/lib/types';

interface KickerProps {
  article: Pick<StorySummary, 'category' | 'sectionName'>;
  asLink?: boolean;
  /** Smaller block label, as in the Most read list. */
  compact?: boolean;
}

/** The red section label above a headline. */
export default function Kicker({ article, asLink = false, compact = false }: KickerProps) {
  const className = cn(
    'font-sans font-semibold text-accent',
    compact ? 'mb-0.5 block text-[12.5px]' : 'mb-1.5 inline-block text-[13px]',
  );
  return asLink ? (
    <Link href={sectionUrl(article.category)} className={cn(className, 'underline-offset-[3px] hover:underline')}>
      {article.sectionName}
    </Link>
  ) : (
    <span className={className}>{article.sectionName}</span>
  );
}
