'use client';

import Link from 'next/link';
import { type ReactNode, useRef, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { channelsTabUrl } from '@/lib/format';
import type { CatalogVideo, Channel, VideoPage } from '@/lib/videos';
import { ChevronIcon, HomeIcon } from '../ui/Icons';
import ShortsShelf from './ShortsShelf';
import { blockTitle, videoGrid, videoGridBesideSidebar } from './styles';
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
  /** Wide screens list the channels in a sidebar instead of the chip row. */
  sidebar?: boolean;
}

// The chip row and the sidebar show this many channels; the rest are on the channels page.
const CHANNEL_LIMIT = 10;

// The catalog repeats: this many rows of long videos, then one row of shorts.
const ROWS_BETWEEN_SHELVES = 2;
const SHORTS_PER_SHELF = 6;

const pagerButton =
  'h-10 rounded-full border border-line bg-surface px-5 text-[14px] font-semibold transition-colors hover:border-fg disabled:pointer-events-none disabled:opacity-40';

type ColumnQueries = [string, number][];

// Must match the grids' column breakpoints in styles.ts (sm 640px, lg 1080px, xl 1280px in globals.css).
const FULL_WIDTH_COLUMNS: ColumnQueries = [['(min-width: 80rem)', 4], ['(min-width: 67.5rem)', 3], ['(min-width: 40rem)', 2]];
const BESIDE_SIDEBAR_COLUMNS: ColumnQueries = [['(min-width: 80rem)', 3], ['(min-width: 40rem)', 2]];

function columnStore(queries: ColumnQueries) {
  const subscribe = (onChange: () => void) => {
    const lists = queries.map(([query]) => window.matchMedia(query));
    lists.forEach((list) => list.addEventListener('change', onChange));
    return () => lists.forEach((list) => list.removeEventListener('change', onChange));
  };
  const current = () => queries.find(([query]) => window.matchMedia(query).matches)?.[1] ?? 1;
  return { subscribe, current };
}

const fullWidthStore = columnStore(FULL_WIDTH_COLUMNS);
const besideSidebarStore = columnStore(BESIDE_SIDEBAR_COLUMNS);

function useGridColumns(sidebar: boolean) {
  const store = sidebar ? besideSidebarStore : fullWidthStore;
  return useSyncExternalStore(store.subscribe, store.current, () => 1);
}

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

/** The first few channels, with the chosen one kept in view even when it's further down the list. */
function leadingChannels(channels: Channel[], chosen: string) {
  const first = channels.slice(0, CHANNEL_LIMIT);
  const picked = chosen && !first.some((c) => c.name === chosen) ? channels.find((c) => c.name === chosen) : undefined;
  return picked ? [picked, ...first.slice(0, CHANNEL_LIMIT - 1)] : first;
}

export default function Catalog({ page, channel, onChannel, onPage, filtered, busy = false, sidebar = false }: CatalogProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const leading = leadingChannels(page.channels, channel);
  const shorts = page.videos.filter((v) => v.short);
  const regular = page.videos.filter((v) => !v.short);
  const sections = interleave(regular, shorts, useGridColumns(sidebar) * ROWS_BETWEEN_SHELVES);

  const turnTo = (next: number) => {
    onPage(next);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const chip = (value: string, label: string, avatar?: string) => (
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
      {value && <ChannelAvatar name={value} src={avatar || undefined} className="size-[26px] text-[10px]" />}
      {label}
    </button>
  );

  const sideRow = (value: string, label: string, icon: ReactNode, count?: number) => (
    <li key={value || 'all'}>
      <button
        type="button"
        aria-pressed={channel === value}
        onClick={() => onChannel(value)}
        className="flex w-full items-center gap-3 rounded-[10px] px-2 py-1.5 text-left text-[14px] font-semibold transition-colors hover:bg-surface-2 aria-pressed:bg-surface-2"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="flex-none text-[12px] font-medium text-muted tabular-nums">{count.toLocaleString('en-GB')}</span>}
      </button>
    </li>
  );

  const grid = (
    <div className="min-w-0">
      {page.channels.length > 0 && (
        <div className={cn('-mx-4 flex items-center sm:-mx-6', sidebar && 'lg:hidden')}>
          <nav aria-label="Channels" className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto py-3 pr-2 pl-4 sm:pl-6">
            {chip('', 'All')}
            {leading.map((c) => chip(c.name, c.name, c.avatar))}
          </nav>
          {/* Pinned outside the scrolling row, so it shows however far the chips are scrolled. */}
          <Link
            href={channelsTabUrl}
            className="relative flex h-[34px] flex-none items-center gap-0.5 rounded-full border border-line bg-surface pr-2 pl-3.5 text-[13.5px] font-semibold transition-colors before:pointer-events-none before:absolute before:inset-y-0 before:-left-7 before:w-6 before:bg-gradient-to-l before:from-bg before:to-transparent mr-4 hover:border-fg-2 sm:mr-6"
          >
            Explore all
            <ChevronIcon size={16} />
          </Link>
        </div>
      )}
      {page.total === 0 && (
        <p className="py-[72px] text-center text-muted">{filtered ? 'No videos match your search.' : 'New videos are on the way. Check back soon.'}</p>
      )}
      <div aria-busy={busy} className={cn('pt-1 pb-4 transition-opacity', sidebar && 'lg:pt-4', busy && 'opacity-60')}>
        {sections.map((section) => (section.kind === 'shorts' ? (
          <ShortsShelf key={`shorts-${section.items[0].id}`} shorts={section.items} />
        ) : (
          <section key={`videos-${section.items[0].id}`} aria-label="Videos" className="pb-8">
            <div className={sidebar ? videoGridBesideSidebar : videoGrid}>
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

  if (!sidebar) return <div ref={topRef} className="scroll-mt-16">{grid}</div>;

  return (
    <div ref={topRef} className="scroll-mt-16 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8">
      {grid}
      {page.channels.length > 0 && (
        <aside
          aria-labelledby="sidebar-channels-title"
          className="hidden lg:sticky lg:top-[72px] lg:block lg:max-h-[calc(100dvh-88px)] lg:self-start lg:overflow-y-auto lg:pt-4"
        >
          <h2 id="sidebar-channels-title" className={blockTitle}>Categories</h2>
          <ul className="grid gap-0.5">
            {sideRow('', 'All videos', <span className="grid size-8 flex-none place-items-center rounded-full bg-surface-2"><HomeIcon size={16} /></span>)}
            {leading.map((c) => sideRow(c.name, c.name, <ChannelAvatar name={c.name} src={c.avatar || undefined} className="size-8 text-[11px]" />, c.count))}
          </ul>
          {page.channels.length > CHANNEL_LIMIT && (
            <Link
              href={channelsTabUrl}
              className="mt-2 flex h-9 items-center justify-center gap-0.5 rounded-full border border-line text-[13.5px] font-semibold transition-colors hover:border-fg"
            >
              Show more
              <ChevronIcon size={16} />
            </Link>
          )}
        </aside>
      )}
    </div>
  );
}
