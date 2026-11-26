'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { type CatalogVideo, channelPosters } from '@/lib/videos';
import ShortsShelf from './ShortsShelf';
import { videoGrid } from './styles';
import VideoCard, { ChannelAvatar } from './VideoCard';

interface CatalogProps {
  videos: CatalogVideo[];
  query: string;
  channel: string;
  onChannel: (channel: string) => void;
}

// The catalog repeats: this many rows of long videos, then one row of shorts.
const ROWS_BETWEEN_SHELVES = 2;
const SHORTS_PER_SHELF = 6;

// Must match videoGrid's column breakpoints (sm 640px, lg 1080px, xl 1280px in globals.css).
const COLUMN_QUERIES: [string, number][] = [['(min-width: 80rem)', 4], ['(min-width: 67.5rem)', 3], ['(min-width: 40rem)', 2]];

function subscribeToColumns(onChange: () => void) {
  const lists = COLUMN_QUERIES.map(([query]) => window.matchMedia(query));
  lists.forEach((list) => list.addEventListener('change', onChange));
  return () => lists.forEach((list) => list.removeEventListener('change', onChange));
}

const currentColumns = () => COLUMN_QUERIES.find(([query]) => window.matchMedia(query).matches)?.[1] ?? 1;

const useGridColumns = () => useSyncExternalStore(subscribeToColumns, currentColumns, () => 1);

type Section = { kind: 'videos' | 'shorts'; items: CatalogVideo[] };

function interleave(regular: CatalogVideo[], shorts: CatalogVideo[], videosPerBlock: number): Section[] {
  const sections: Section[] = [];
  let videoAt = 0;
  let shortAt = 0;
  while (videoAt < regular.length || shortAt < shorts.length) {
    // With no shorts left to break them up, the remaining long videos form one grid.
    const videos = regular.slice(videoAt, shortAt < shorts.length ? videoAt + videosPerBlock : regular.length);
    videoAt += videos.length;
    if (videos.length) sections.push({ kind: 'videos', items: videos });
    // Once the long videos run out, the remaining shorts share one last shelf.
    const shelfSize = videoAt < regular.length ? SHORTS_PER_SHELF : shorts.length;
    const shelf = shorts.slice(shortAt, shortAt + shelfSize);
    shortAt += shelf.length;
    if (shelf.length) sections.push({ kind: 'shorts', items: shelf });
  }
  return sections;
}

const matches = (video: CatalogVideo, query: string) =>
  [video.title, video.description, video.channel, ...video.tags].join(' ').toLowerCase().includes(query);

export default function Catalog({ videos, query, channel, onChannel }: CatalogProps) {
  const channels = [...new Set(videos.map((v) => v.channel).filter(Boolean))].sort();
  const posters = channelPosters(videos);
  const needle = query.trim().toLowerCase();
  const shown = videos.filter((v) => (!channel || v.channel === channel) && (!needle || matches(v, needle)));
  const shorts = shown.filter((v) => v.short);
  const regular = shown.filter((v) => !v.short);
  const sections = interleave(regular, shorts, useGridColumns() * ROWS_BETWEEN_SHELVES);

  const chip = (value: string, label: string) => (
    <button
      key={value || 'all'}
      type="button"
      aria-pressed={channel === value}
      onClick={() => onChannel(value)}
      className={cn(
        'inline-flex h-[34px] flex-none items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors',
        value && 'pl-1',
        channel === value ? 'border-fg bg-fg text-bg' : 'border-line bg-surface hover:border-fg-2',
      )}
    >
      {value && <ChannelAvatar name={value} src={posters.get(value)} className="size-[26px] text-[10px]" />}
      {label}
    </button>
  );

  return (
    <>
      {channels.length > 1 && (
        <nav aria-label="Channels" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3 sm:-mx-6 sm:px-6">
          {chip('', 'All')}
          {channels.map((name) => chip(name, name))}
        </nav>
      )}
      {shown.length === 0 && (
        <p className="py-[72px] text-center text-muted">{videos.length ? 'No videos match your search.' : 'New videos are on the way. Check back soon.'}</p>
      )}
      <div className="pt-1 pb-12">
        {sections.map((section) => (section.kind === 'shorts' ? (
          <ShortsShelf key={`shorts-${section.items[0].id}`} shorts={section.items} />
        ) : (
          <section key={`videos-${section.items[0].id}`} aria-label="Videos" className="pb-8">
            <div className={videoGrid}>
              {section.items.map((video) => <VideoCard key={video.id} video={video} />)}
            </div>
          </section>
        )))}
      </div>
    </>
  );
}
