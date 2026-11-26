'use client';

import { type MouseEvent, type ReactNode, useState } from 'react';
import { episodeLabel, episodeName, pushEpisodeUrl, titleWithEpisode } from '@/lib/episodes';
import { cn } from '@/lib/cn';
import { videoUrl } from '@/lib/format';
import type { Comment } from '@/lib/comments';
import type { CatalogVideo, Episode } from '@/lib/videos';
import { ChevronIcon } from '../ui/Icons';
import CommentsSection from './CommentsSection';
import { blockTitle, watchTitle } from './styles';
import EmbeddedPlayer from './EmbeddedPlayer';
import VideoCard, { ChannelAvatar, videoStats } from './VideoCard';

interface WatchViewProps {
  video: CatalogVideo;
  /** The API's signed play endpoint for this video. */
  playEndpoint: string;
  /** Recommendations for this video, shown beside it on wide screens. */
  upNext: CatalogVideo[];
  /** The home page's catalogue, browsed below. */
  moreVideos: ReactNode;
  channelPoster?: string;
  /** The playing episode (0-based), or -1. */
  episode: number;
  /** `?ep=` as given (from 1), or 0; the player picks the file from it. */
  requestedEpisode: number;
  start: number;
  /** The video's seeded comments. */
  comments: Comment[];
  onEpisodes: (episodes: Episode[], playing: number) => void;
}

export default function WatchView({ video, playEndpoint, upNext, moreVideos, channelPoster, episode, requestedEpisode, start, comments, onEpisodes }: WatchViewProps) {
  // Keyed by video so the description starts hidden again on the next video.
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const detailsOpen = detailsFor === video.id;
  const title = titleWithEpisode(video, episode);
  const hasDetails = Boolean(video.description || video.tags.length);

  return (
    <WatchLayout upNext={upNext} moreVideos={moreVideos}>
      <article className="min-w-0">
        <div className="-mx-4 sm:mx-0">
          <EmbeddedPlayer key={video.id} videoId={video.id} endpoint={playEndpoint} title={title} episode={requestedEpisode} start={start} onEpisodes={onEpisodes} />
        </div>

        <h1 title={title} className={watchTitle}>{title}</h1>
        <div className="mt-1 flex items-center gap-3">
          <p className="flex min-w-0 flex-1 flex-wrap items-center text-[13px] text-muted [&>span+span]:before:mx-1.5 [&>span+span]:before:content-['·']">
            {video.live && <span className="font-semibold text-accent">Live</span>}
            {videoStats(video, { full: true }).map((part) => <span key={part}>{part}</span>)}
          </p>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setDetailsFor(detailsOpen ? null : video.id)}
              aria-expanded={detailsOpen}
              aria-controls="video-description"
              className="flex flex-none items-center gap-0.5 rounded-full py-1 pr-1.5 pl-2.5 text-[13px] font-semibold transition-colors hover:bg-surface-2"
            >
              Description
              <ChevronIcon size={16} className={cn('transition-transform', detailsOpen ? '-rotate-90' : 'rotate-90')} />
            </button>
          )}
        </div>

        {detailsOpen && (
          <div id="video-description" className="mt-3 rounded-[14px] bg-surface px-4 py-3.5">
            {video.description && (
              <p className="font-serif text-[15.5px] leading-[1.6] [overflow-wrap:anywhere] whitespace-pre-line text-fg-2">{video.description}</p>
            )}
            {video.tags.length > 0 && <p className={cn('text-[13px] text-muted', video.description && 'mt-2.5')}>{video.tags.join(', ')}</p>}
          </div>
        )}

        {video.channel && (
          <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-surface py-1 pr-3.5 pl-1">
            <ChannelAvatar name={video.channel} src={channelPoster} className="size-8 text-[11px]" />
            <span className="truncate text-[14px] font-bold">{video.channel}</span>
          </p>
        )}

        {video.episodes.length > 0 && <EpisodeList video={video} current={episode} />}

        <CommentsSection key={video.id} videoId={video.id} seeds={comments} />
      </article>
    </WatchLayout>
  );
}

/** The page around a playing video: Up next beside it on wide screens (below on phones), then the catalogue. */
export function WatchLayout({ children, upNext, moreVideos }: { children: ReactNode; upNext: CatalogVideo[]; moreVideos: ReactNode }) {
  return (
    <div className="grid gap-6 pb-14 sm:pt-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
      {children}

      {upNext.length > 0 && (
        <aside aria-labelledby="up-next-title">
          <h2 id="up-next-title" className={blockTitle}>Up next</h2>
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-1 lg:gap-3">
            {upNext.map((item) => <VideoCard key={item.id} video={item} compact />)}
          </div>
        </aside>
      )}

      {moreVideos && (
        <section aria-labelledby="more-videos-title" className="min-w-0 lg:col-span-2">
          <h2 id="more-videos-title" className={blockTitle}>More videos</h2>
          {moreVideos}
        </section>
      )}
    </div>
  );
}

function EpisodeList({ video, current }: { video: CatalogVideo; current: number }) {
  const open = (event: MouseEvent, episode: number) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pushEpisodeUrl(video.id, episode);
  };

  return (
    <section aria-labelledby="episodes-title" className="mt-4">
      <h2 id="episodes-title" className="mb-2 text-[12px] font-bold tracking-[0.06em] text-muted uppercase">Episodes</h2>
      <ol className="flex max-h-[200px] flex-wrap gap-2 overflow-y-auto">
        {video.episodes.map((_, index) => (
          <li key={index} className="max-w-full">
            <a
              href={videoUrl(video.id, index + 1)}
              onClick={(event) => open(event, index + 1)}
              title={episodeName(video, index)}
              aria-current={index === current ? 'page' : undefined}
              className="block max-w-full min-w-12 truncate rounded-md border border-line bg-surface px-3 py-1.5 text-center text-[14px] font-semibold tabular-nums transition-colors hover:border-fg aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-white"
            >
              {episodeLabel(video, index)}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
