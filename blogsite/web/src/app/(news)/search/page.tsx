import type { Metadata } from 'next';
import ListingLayout from '@/components/listing/ListingLayout';
import SearchResults from '@/components/listing/SearchResults';
import { getSearchIndex, getSiteData } from '@/lib/data';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage() {
  const { t } = await getSiteData();

  return (
    <ListingLayout crumb="Search">
      <SearchResults
        articles={await getSearchIndex()}
        latestTitle={t('latest', 'Latest')}
        latestIntro={t('latestIntro', '')}
      />
    </ListingLayout>
  );
}
