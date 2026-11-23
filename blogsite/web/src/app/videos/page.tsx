import type { Metadata } from 'next';
import { Suspense } from 'react';
import VideosApp from '@/components/videos/VideosApp';
import commentsJson from '@/data/comments.json';
import type { SeedComments } from '@/lib/comments';
import { getSiteData } from '@/lib/data';

export const metadata: Metadata = { title: 'Videos' };

export default async function VideosPage() {
  const { t } = await getSiteData();
  return (
    // The page reads ?v= on the client, which a static export needs a Suspense boundary for.
    <Suspense fallback={null}>
      <VideosApp comments={commentsJson as SeedComments} brand={t('videosBrand', 'Quillwood Video')} />
    </Suspense>
  );
}
