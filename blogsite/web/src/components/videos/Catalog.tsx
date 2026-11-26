'use client';

import { useRef, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import type { CatalogVideo, VideoPage } from '@/lib/videos';
import ShortsShelf from './ShortsShelf';
import { videoGrid } from './styles';
import VideoCard, { ChannelAvatar } from './VideoCard';

interface CatalogProps {
  /** The page the server sent; it does the searching and channel filtering. */
  page: VideoPage;
  channel: string;
  onChannel: (channel: string) => void;
  onPage: (page: number) => void;
  /** Search words or a channel are applied. */
  filtered: boolean;
  /** Another page is loading; this one stays up meanwhile. */
  busy?: boolean;
}

const pagerButton =
  'h-10 rounded-full border border-line bg-surface px-5 text-[14px] font-semibold transition-colors hover:border-fg disabled:pointer-events-none disabled:opacity-40';

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

export default function Catalog({ page, channel, onChannel, onPage, filtered, busy = false }: CatalogProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const avatars = new Map(page.channels.map((c) => [c.name, c.avatar]));
  const shorts = page.videos.filter((v) => v.short);
  const regular = page.videos.filter((v) => !v.short);
  const sections = interleave(regular, shorts, useGridColumns() * ROWS_BETWEEN_SHELVES);

  const turnTo = (next: number) => {
    onPage(next);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

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
      {value && <ChannelAvatar name={value} src={avatars.get(value) || undefined} className="size-[26px] text-[10px]" />}
      {label}
    </button>
  );

  return (
    <div ref={topRef} className="scroll-mt-16">
      {page.channels.length > 1 && (
        <nav aria-label="Channels" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3 sm:-mx-6 sm:px-6">
          {chip('', 'All')}
          {page.channels.map(({ name }) => chip(name, name))}
        </nav>
      )}
      {page.total === 0 && (
        <p className="py-[72px] text-center text-muted">{filtered ? 'No videos match your search.' : 'New videos are on the way. Check back soon.'}</p>
      )}
      <div aria-busy={busy} className={cn('pt-1 pb-4 transition-opacity', busy && 'opacity-60')}>
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
      {page.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 pb-12">
          <button type="button" onClick={() => turnTo(page.page - 1)} disabled={busy || page.page <= 1} className={pagerButton}>
            Previous
          </button>
          <span className="text-[13.5px] text-muted tabular-nums">Page {page.page} of {page.pages}</span>
          <button type="button" onClick={() => turnTo(page.page + 1)} disabled={busy || page.page >= page.pages} className={pagerButton}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
