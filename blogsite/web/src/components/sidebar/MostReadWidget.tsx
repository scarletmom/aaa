import Link from 'next/link';
import { cn } from '@/lib/cn';
import { getSiteData, mostRead } from '@/lib/data';
import { articleUrl } from '@/lib/format';
import Kicker from '../story/Kicker';
import BlockTitle from '../ui/BlockTitle';
import { headline } from '../ui/styles';

export default async function MostReadWidget() {
  const { articles, t } = await getSiteData();
  return (
    <section aria-labelledby="most-read-title">
      <BlockTitle id="most-read-title">{t('mostRead', 'Most read')}</BlockTitle>
      <ol>
        {mostRead(articles).map((article, index) => (
          <li
            key={article.id}
            className="grid grid-cols-[34px_minmax(0,1fr)] gap-1.5 border-t border-line py-3 first:border-t-0 first:pt-0"
          >
            <span aria-hidden="true" className="font-serif text-[28px] leading-none font-semibold text-muted">{index + 1}</span>
            <div>
              <Kicker article={article} compact />
              <Link href={articleUrl(article)} className={cn('font-serif text-[16.5px] leading-[1.35]', headline)}>
                {article.title}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
