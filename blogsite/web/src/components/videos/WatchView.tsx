'use client';

import { type MouseEvent, useState } from 'react';
import { episodeLabel, episodeName, pushEpisodeUrl, titleWithEpisode } from '@/lib/episodes';
import { videoUrl } from '@/lib/format';
import type { Comment } from '@/lib/comments';
import type { CatalogVideo, Episode } from '@/lib/videos';
import CommentsSection from './CommentsSection';
import { blockTitle } from './styles';
import EmbeddedPlayer from './EmbeddedPlayer';
import VideoCard, { ChannelAvatar, videoStats } from './VideoCard';

const LONG_DESCRIPTION = 220;

interface WatchViewProps {
  video: CatalogVideo;
  /** The API's signed play endpoint for this video. */
  playEndpoint: string;
  upNext: CatalogVideo[];
  /** The playing episode (0-based), or -1. */
  episode: number;
  /** `?ep=` as given (from 1), or 0; the player picks the file from it. */
  requestedEpisode: number;
  start: number;
  /** The video's seeded comments. */
  comments: Comment[];
  onEpisodes: (episodes: Episode[], playing: number) => void;
}

export default function WatchView({ video, playEndpoint, upNext, episode, requestedEpisode, start, comments, onEpisodes }: WatchViewProps) {
  const [expanded, setExpanded] = useState(false);
  const title = titleWithEpisode(video, episode);
  const long = video.description.length > LONG_DESCRIPTION;

  return (
    <div className="grid gap-8 pb-14 sm:pt-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
      <article className="min-w-0">
        <div className="-mx-4 sm:mx-0">
          <EmbeddedPlayer key={video.id} videoId={video.id} endpoint={playEndpoint} title={title} episode={requestedEpisode} start={start} onEpisodes={onEpisodes} />
        </div>

        <h1 className="mt-4 font-display text-[24px] leading-[1.2] font-bold tracking-[-0.005em] md:text-[30px]">{title}</h1>
        <p className="mt-2 flex flex-wrap items-center text-[13.5px] text-muted [&>span+span]:before:mx-1.5 [&>span+span]:before:content-['·']">
          {video.live && <span className="font-semibold text-accent">Live</span>}
          {videoStats(video, { full: true }).map((part) => <span key={part}>{part}</span>)}
          {video.tags.length > 0 && <span>{video.tags.join(', ')}</span>}
        </p>

        {video.episodes.length > 0 && <EpisodeList video={video} current={episode} />}

        {video.channel && (
          <p className="mt-4 inline-flex items-center gap-3 rounded-full bg-surface py-1.5 pr-4 pl-1.5">
            <ChannelAvatar name={video.channel} className="size-11" />
            <span className="font-bold">{video.channel}</span>
          </p>
        )}

        {video.description && (
          <div className="mt-4 rounded-[14px] bg-surface px-4 py-3.5">
            <p className={`font-serif text-[16px] leading-[1.6] [overflow-wrap:anywhere] whitespace-pre-line text-fg-2 ${long && !expanded ? 'line-clamp-4' : ''}`}>
              {video.description}
            </p>
            {long && (
              <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="mt-1.5 text-[13.5px] font-bold">
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        <CommentsSection key={video.id} videoId={video.id} seeds={comments} />
      </article>

      {upNext.length > 0 && (
        <aside aria-labelledby="up-next-title">
          <h2 id="up-next-title" className={blockTitle}>Up next</h2>
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-1 lg:gap-3">
            {upNext.map((item) => <VideoCard key={item.id} video={item} compact />)}
          </div>
        </aside>
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
