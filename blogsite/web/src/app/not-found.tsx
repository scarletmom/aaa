import type { Metadata } from 'next';
import NewsChrome from '@/components/site/NewsChrome';
import Notice from '@/components/ui/Notice';
import { getSiteData } from '@/lib/data';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getSiteData();
  return { title: t('notFoundTitle', 'Not found') };
}

export default async function NotFound() {
  const { t } = await getSiteData();
  return (
    <NewsChrome>
      <Notice title={t('notFoundTitle', 'Not found')} text={t('notFoundText', '')} />
    </NewsChrome>
  );
}
