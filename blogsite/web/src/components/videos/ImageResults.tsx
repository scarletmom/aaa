'use client';

import type { CatalogVideo } from '@/lib/videos';
import { ImageIcon } from '../ui/Icons';
import ShortsShelf from './ShortsShelf';
import { videoGrid } from './styles';
import type { ImageSearch } from './useImageSearch';
import VideoCard from './VideoCard';

const SKELETON_CARDS = 8;

/** The catalog's place while searching by image: the picture, then what the backend matched. */
export default function ImageResults({ search, videos, onClear }: { search: ImageSearch; videos: CatalogVideo[]; onClear: () => void }) {
  const byId = new Map(videos.map((video) => [video.id, video]));
  const matches = search.ids.map((id) => byId.get(id)).filter((video): video is CatalogVideo => Boolean(video));
  const shorts = matches.filter((video) => video.short);
  const regular = matches.filter((video) => !video.short);

  return (
    <section aria-labelledby="image-results-title" aria-busy={search.status === 'loading'} className="pt-5 pb-12">
      <div className="flex items-center gap-4 border-b border-line pb-4">
        <img src={search.previewUrl} alt="Your search image" className="size-16 flex-none rounded-xl bg-surface-2 object-cover" />
        <div className="min-w-0 flex-1">
          <h1 id="image-results-title" className="text-[18px] font-bold">Videos like your image</h1>
          <p className="truncate text-[13px] text-muted">
            {search.status === 'loading' ? 'Searching…' : search.status === 'done' ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}` : search.name}
          </p>
        </div>
        <button type="button" onClick={onClear} className="h-9 flex-none rounded-full border border-line px-4 text-[13.5px] font-semibold hover:border-fg">
          Clear
        </button>
      </div>

      {search.status === 'loading' && (
        <div aria-hidden="true" className={`${videoGrid} mt-6`}>
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-video rounded-xl bg-surface-2" />
              <div className="mt-3 h-4 w-4/5 rounded bg-surface-2" />
              <div className="mt-2 h-3 w-1/2 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}

      {search.status === 'error' && (
        <div role="alert" className="grid place-items-center gap-3 py-20 text-center">
          <ImageIcon size={34} className="text-muted" />
          <p className="max-w-[420px] text-[15px] font-semibold">{search.error}</p>
          <button type="button" onClick={onClear} className="rounded-full bg-fg px-5 py-2 text-[14px] font-semibold text-bg hover:opacity-90">
            Back to all videos
          </button>
        </div>
      )}

      {search.status === 'done' && matches.length === 0 && (
        <p className="py-20 text-center text-muted">No videos match this image. Try another one.</p>
      )}

      {search.status === 'done' && regular.length > 0 && (
        <div className={`${videoGrid} mt-6`}>
          {regular.map((video) => <VideoCard key={video.id} video={video} />)}
        </div>
      )}
      {search.status === 'done' && shorts.length > 0 && (
        <div className="mt-8">
          <ShortsShelf shorts={shorts} />
        </div>
      )}
    </section>
  );
}
