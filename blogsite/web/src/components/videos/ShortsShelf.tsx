'use client';

import Link from 'next/link';
import { useId } from 'react';
import { videoUrl } from '@/lib/format';
import type { CatalogVideo } from '@/lib/videos';
import { PlaySolidIcon } from '../ui/Icons';
import { blockTitle } from './styles';
import { videoStats } from './VideoCard';

function ShortCard({ video }: { video: CatalogVideo }) {
  const meta = videoStats(video).join(' · ');
  return (
    <Link href={videoUrl(video.id)} className="group block w-[168px] flex-none snap-start sm:w-[196px]">
      <span className="relative block aspect-[9/16] overflow-hidden rounded-xl bg-img">
        {video.poster
          ? <img src={video.poster} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          : <span className="grid size-full place-items-center text-muted"><PlaySolidIcon size={28} /></span>}
        {video.duration && (
          <span className="absolute right-2 bottom-2 rounded-[5px] bg-black/80 px-1.5 py-px text-[12px] font-semibold text-white tabular-nums">{video.duration}</span>
        )}
      </span>
      <span className="mt-2.5 line-clamp-2 px-0.5 text-[14.5px] leading-[1.35] font-semibold decoration-1 underline-offset-[0.14em] group-hover:underline">
        {video.title}
      </span>
      {meta && <span className="mt-1 block px-0.5 text-[12.5px] text-muted">{meta}</span>}
    </Link>
  );
}

export default function ShortsShelf({ shorts }: { shorts: CatalogVideo[] }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="pb-10">
      <h2 id={titleId} className={blockTitle}>Shorts</h2>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 scroll-px-4 sm:-mx-6 sm:gap-4 sm:px-6 sm:scroll-px-6">
        {shorts.map((video) => <ShortCard key={video.id} video={video} />)}
      </div>
    </section>
  );
}
