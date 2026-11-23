import Link from 'next/link';
import { getSiteData } from '@/lib/data';
import { searchUrl } from '@/lib/format';
import BlockTitle from '../ui/BlockTitle';
import { pillClass } from '../ui/styles';

export default async function TrendingWidget() {
  const { site, t } = await getSiteData();
  return (
    <section aria-labelledby="trending-title">
      <BlockTitle id="trending-title">{t('trending', 'Trending')}</BlockTitle>
      <div className="flex flex-wrap gap-2">
        {site.trending.map((term) => <Link key={term} href={searchUrl(term)} className={pillClass}>{term}</Link>)}
      </div>
    </section>
  );
}
