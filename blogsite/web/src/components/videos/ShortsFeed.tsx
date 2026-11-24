'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { videoUrl } from '@/lib/format';
import type { CatalogVideo } from '@/lib/videos';
import { ChevronIcon, MutedIcon, PlaySolidIcon, VolumeIcon } from '../ui/Icons';
import { useStreamSource } from './useStreamSource';
import { ChannelAvatar, videoStats } from './VideoCard';

// Neighbours keep a loaded <video>, so the next swipe starts without a wait.
const PRELOAD_DISTANCE = 1;
// Distance a wheel or trackpad gesture travels, in total, before it moves to the next short.
const WHEEL_STEP_DISTANCE = 40;
// A trackpad keeps firing wheel events while its momentum fades; one gesture should move one short.
const WHEEL_GESTURE_GAP_MS = 250;
// A swipe made while the last one's momentum is still fading shows up as a jump in speed.
const WHEEL_NEW_SWIPE_RATIO = 1.5;
const WHEEL_NEW_SWIPE_MIN_MS = 300;

const startingFrom = (shorts: CatalogVideo[], id: string) => {
  const at = Math.max(0, shorts.findIndex((v) => v.id === id));
  return [...shorts.slice(at), ...shorts.slice(0, at)];
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

interface ShortsFeedProps {
  shorts: CatalogVideo[];
  startId: string;
}

/** Full-height, one-at-a-time Shorts player that loops through the shorts for as long as the viewer scrolls. */
export default function ShortsFeed({ shorts, startId }: ShortsFeedProps) {
  const [cycle] = useState(() => startingFrom(shorts, startId));
  const [count, setCount] = useState(cycle.length * 2);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(current);

  const shortAt = (index: number) => cycle[index % cycle.length];
  const currentShortId = shortAt(current).id;

  const goTo = useCallback((index: number) => {
    if (index < 0) return;
    feedRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.index));
      }
    }, { root: feed, threshold: 0.6 });
    feed.querySelectorAll('[data-index]').forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    currentRef.current = current;
    if (current >= count - cycle.length) setCount((total) => total + cycle.length);
  }, [current, count, cycle.length]);

  useEffect(() => {
    window.history.replaceState(null, '', videoUrl(currentShortId));
  }, [currentShortId]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    let lastWheel = 0;
    let lastSpeed = 0;
    let lastStep = 0;
    let travelled = 0;
    let stepped = false;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? feed.clientHeight : 1;
      const delta = event.deltaY * scale;
      const speed = Math.abs(delta);
      const newGesture = event.timeStamp - lastWheel > WHEEL_GESTURE_GAP_MS
        || (stepped && event.timeStamp - lastStep > WHEEL_NEW_SWIPE_MIN_MS && speed > lastSpeed * WHEEL_NEW_SWIPE_RATIO + 2);
      if (newGesture) {
        stepped = false;
        travelled = 0;
      }
      lastWheel = event.timeStamp;
      lastSpeed = speed;
      if (stepped) return;
      travelled += delta;
      if (Math.abs(travelled) < WHEEL_STEP_DISTANCE) return;
      stepped = true;
      lastStep = event.timeStamp;
      goTo(currentRef.current + Math.sign(travelled));
    };

    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'm') setMuted((value) => !value);
      const step = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      goTo(currentRef.current + step);
    };

    feed.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      feed.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [goTo]);

  return (
    <section aria-label="Shorts" className="relative -mx-4 sm:mx-0">
      <div
        ref={feedRef}
        className="no-scrollbar h-[calc(100svh-3.5rem-1px)] snap-y max-md:h-[calc(100svh-3.5rem-1px-var(--tab-bar-h))] snap-mandatory overflow-y-auto overscroll-contain"
      >
        {Array.from({ length: count }, (_, index) => (
          <ShortSlide
            key={index}
            index={index}
            video={shortAt(index)}
            near={Math.abs(index - current) <= PRELOAD_DISTANCE}
            playing={index === current}
            muted={muted}
            onMutedChange={setMuted}
          />
        ))}
      </div>

      <div className="absolute top-1/2 right-0 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        <NavButton label="Previous short" className="-rotate-90" disabled={current === 0} onClick={() => goTo(current - 1)} />
        <NavButton label="Next short" className="rotate-90" onClick={() => goTo(current + 1)} />
      </div>
    </section>
  );
}

function NavButton({ label, className, disabled = false, onClick }: { label: string; className: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg transition-colors hover:bg-line disabled:opacity-40"
    >
      <ChevronIcon size={22} className={className} />
    </button>
  );
}

interface ShortSlideProps {
  index: number;
  video: CatalogVideo;
  near: boolean;
  playing: boolean;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}

function ShortSlide({ index, video, near, playing, muted, onMutedChange }: ShortSlideProps) {
  const meta = videoStats(video).join(' · ');
  return (
    <article data-index={index} aria-label={video.title} className="flex h-full snap-start snap-always justify-center sm:py-4">
      <div className="relative h-full w-full overflow-hidden bg-black text-white sm:aspect-[9/16] sm:w-auto sm:max-w-full sm:rounded-2xl">
        {near ? (
          <ShortVideo video={video} playing={playing} muted={muted} onMutedChange={onMutedChange} />
        ) : (
          video.poster && <img src={video.poster} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pt-16 pb-6">
          {video.channel && (
            <p className="flex items-center gap-2.5 text-[14.5px] font-semibold">
              <ChannelAvatar name={video.channel} className="size-8 bg-white/90! text-[11px] text-black!" />
              {video.channel}
            </p>
          )}
          <h2 className="mt-2.5 line-clamp-2 text-[15px] leading-[1.35] font-semibold">{video.title}</h2>
          {meta && <p className="mt-1 text-[12.5px] text-white/75">{meta}</p>}
        </div>
      </div>
    </article>
  );
}

interface ShortVideoProps {
  video: CatalogVideo;
  playing: boolean;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}

function ShortVideo({ video, playing, muted, onMutedChange }: ShortVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { failed, retry, attached } = useStreamSource(videoRef, video.sources);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !attached) return;
    if (!playing) {
      element.pause();
      element.currentTime = 0;
      return;
    }
    element.play().catch((error: DOMException) => {
      if (error.name !== 'NotAllowedError') return;
      // Browsers refuse sound without a recent tap, so start muted like Shorts and Reels do.
      element.muted = true;
      onMutedChange(true);
      element.play().catch(() => { /* still refused: the paused overlay invites a tap */ });
    });
  }, [playing, attached, onMutedChange]);

  const togglePlay = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => {});
    else element.pause();
  };

  return (
    <>
      <video
        ref={videoRef}
        loop
        playsInline
        preload="auto"
        poster={video.poster || undefined}
        onClick={togglePlay}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(event) => {
          const { currentTime, duration } = event.currentTarget;
          setProgress(duration ? currentTime / duration : 0);
        }}
        className="size-full cursor-pointer object-contain"
      />

      {playing && paused && !failed && (
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 grid size-16 -translate-1/2 place-items-center rounded-full bg-black/55">
          <PlaySolidIcon size={28} className="ml-1" />
        </span>
      )}

      <button
        type="button"
        onClick={() => onMutedChange(!muted)}
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
        className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-black/45 hover:bg-black/70"
      >
        {muted ? <MutedIcon size={20} /> : <VolumeIcon size={20} />}
      </button>

      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
        <span className="block h-full bg-accent" style={{ width: `${progress * 100}%` }} />
      </span>

      {failed && (
        <div role="alert" className="absolute inset-0 grid place-content-center gap-3 bg-black/85 px-6 text-center">
          <p className="text-[15px] font-semibold">This short can’t be played right now.</p>
          <button type="button" onClick={retry} className="mx-auto rounded-full bg-white px-5 py-2 text-[14px] font-semibold text-black hover:bg-white/85">
            Try again
          </button>
        </div>
      )}
    </>
  );
}
