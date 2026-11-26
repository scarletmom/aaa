'use client';

import Link from 'next/link';
import { channelUrl } from '@/lib/format';
import type { Channel } from '@/lib/videos';
import { ChannelAvatar } from './VideoCard';

const videoCount = (count: number) => `${count.toLocaleString('en-GB')} ${count === 1 ? 'video' : 'videos'}`;

/** Every channel; picking one opens the home page filtered to it. */
export default function ChannelsView({ channels, active }: { channels: Channel[]; active: string }) {
  return (
    <section aria-labelledby="channels-title" className="pt-5 pb-14">
      <h1 id="channels-title" className="font-display text-[22px] leading-[1.2] font-bold md:text-[28px]">Categories</h1>
      <p className="mt-1 text-[13.5px] text-muted">{channels.length.toLocaleString('en-GB')} {channels.length === 1 ? 'category' : 'categories'}</p>
      {channels.length === 0 ? (
        <p className="py-[72px] text-center text-muted">No categories yet.</p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {channels.map((channel) => (
            <li key={channel.name}>
              <Link
                href={channelUrl(channel.name)}
                aria-current={active === channel.name ? 'true' : undefined}
                className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-3 transition-colors hover:border-fg-2 aria-[current=true]:border-fg"
              >
                <ChannelAvatar name={channel.name} src={channel.avatar || undefined} className="size-12 text-[14px]" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-bold">{channel.name}</span>
                  <span className="text-[13px] text-muted">{videoCount(channel.count)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
