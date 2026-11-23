'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatViews, initials, timeAgo, videoUrl } from '@/lib/format';
import type { CatalogVideo } from '@/lib/videos';
import { PlaySolidIcon } from '../ui/Icons';

export const isUpcoming = (video: CatalogVideo) => Boolean(video.startsAt && new Date(video.startsAt).getTime() > Date.now());

export function ChannelAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('grid size-9 flex-none place-items-center rounded-full bg-surface-2 text-[12px] font-bold text-fg-2', className)}>
      {initials(name)}
    </span>
  );
}

function Badge({ video }: { video: CatalogVideo }) {
  if (isUpcoming(video)) return <span className="rounded-[5px] bg-black/80 px-1.5 py-px text-[11.5px] font-bold tracking-[0.04em] text-white uppercase">Upcoming</span>;
  if (video.live) return <span className="rounded-[5px] bg-accent px-1.5 py-px text-[11.5px] font-bold tracking-[0.04em] text-white uppercase">Live</span>;
  if (video.duration) return <span className="rounded-[5px] bg-black/80 px-1.5 py-px text-[12px] font-semibold text-white tabular-nums">{video.duration}</span>;
  return null;
}

export function Thumb({ video, className }: { video: CatalogVideo; className?: string }) {
  return (
    <span className={cn('relative block aspect-video overflow-hidden rounded-xl bg-img', className)}>
      {video.poster
        ? <img src={video.poster} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        : <span className="grid size-full place-items-center text-muted"><PlaySolidIcon size={28} /></span>}
      <span className="absolute right-2 bottom-2"><Badge video={video} /></span>
    </span>
  );
}

export function videoMeta(video: CatalogVideo): string {
  if (isUpcoming(video)) return 'Scheduled';
  if (video.live) return 'Streaming now';
  return video.publishedAt ? timeAgo(video.publishedAt) : '';
}

/** Views and age, as shown under a title: "1.2M views", "3 days ago"; a live stream's viewers replace "Streaming now". */
export function videoStats(video: CatalogVideo, { full = false } = {}): string[] {
  const views = video.views !== null && !isUpcoming(video) ? formatViews(video.views, { live: video.live, full }) : '';
  const meta = video.live && views ? '' : videoMeta(video);
  return [views, meta].filter(Boolean);
}

/** A grid card; `compact` turns it into a thumbnail-and-title row on wide screens (the "Up next" list). */
export default function VideoCard({ video, compact = false }: { video: CatalogVideo; compact?: boolean }) {
  return (
    <Link href={videoUrl(video.id)} className={cn('group block min-w-0', compact && 'lg:flex lg:gap-2.5')}>
      <Thumb video={video} className={cn(compact && 'lg:w-[168px] lg:flex-none lg:rounded-[10px]')} />
      <span className={cn('flex gap-3 px-0.5 pt-3', compact && 'lg:p-0')}>
        <ChannelAvatar name={video.channel} className={cn(compact && 'lg:hidden')} />
        <span className="flex min-w-0 flex-col gap-1">
          <span className={cn('line-clamp-2 text-[15.5px] leading-[1.35] font-semibold decoration-1 underline-offset-[0.14em] group-hover:underline', compact && 'lg:text-[14px]')}>
            {video.title}
          </span>
          <span className={cn('flex flex-col text-[13px] text-muted', compact && 'lg:text-[12.5px]')}>
            {video.channel && <span className="truncate">{video.channel}</span>}
            <span>{videoStats(video).join(' · ')}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
