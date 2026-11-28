'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatViews, timeAgo } from '@/lib/format';
import { parseTeraboxLink, type TeraboxLink } from '@/lib/teraboxLink';
import type { TeraboxListing, TeraboxPage, TeraboxSort, TeraboxVideo } from '@/lib/videos';
import { CloseIcon, CloudPlayIcon, CopyIcon, PlaySolidIcon } from '../ui/Icons';
import Pager from './Pager';
import { blockTitle, videoGrid, watchTitle } from './styles';
import { WatchLayout } from './WatchView';

interface TeraboxViewProps {
  /** A link to play as soon as the view opens, as if it had been pasted. */
  initialLink?: string;
  /** Called once `initialLink` has been taken. */
  onInitialLink?: () => void;
  /** Resolves the link to something playable; a rejection's message is shown under the box. */
  onWatch: (link: TeraboxLink) => Promise<TeraboxVideo>;
  /** A saved video has opened in the player. */
  onViewed?: (key: string) => void;
  /** The current page of saved Terabox videos, or null while the first one loads. */
  listing: TeraboxPage | null;
  /** Shown in place of the saved videos when they couldn't load. */
  listingProblem: ReactNode;
  sort: TeraboxSort;
  onSort: (sort: TeraboxSort) => void;
  onPage: (page: number) => void;
  /** Another page of saved videos is loading. */
  listingBusy: boolean;
}

const SKELETON_CARDS = 4;
const SORTS: { value: TeraboxSort; label: string }[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'popular', label: 'Popular' },
  { value: 'recent', label: 'Recent' },
];
const UP_NEXT_LIMIT = 6;

function TeraboxCard({ video, onPlay, compact = false }: { video: TeraboxListing; onPlay: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={cn('group block w-full min-w-0 text-left', compact && 'lg:flex lg:gap-2.5')}
    >
      <span className={cn('relative block aspect-video overflow-hidden rounded-xl bg-img', compact && 'lg:w-[168px] lg:flex-none lg:rounded-[10px]')}>
        {video.thumbnail
          ? <img src={video.thumbnail} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          : <span className="grid size-full place-items-center text-muted"><PlaySolidIcon size={28} /></span>}
        {video.duration && (
          <span className="absolute right-2 bottom-2 rounded-[5px] bg-black/80 px-1.5 py-px text-[12px] font-semibold text-white tabular-nums">{video.duration}</span>
        )}
      </span>
      <span className={cn('flex min-w-0 flex-col gap-1 px-0.5 pt-3', compact && 'lg:p-0')}>
        <span className={cn('line-clamp-2 text-[15.5px] leading-[1.35] font-semibold decoration-1 underline-offset-[0.14em] group-hover:underline', compact && 'lg:text-[14px]')}>
          {video.title}
        </span>
        <span className={cn('text-[13px] text-muted', compact && 'lg:text-[12.5px]')}>
          {[formatViews(video.views ?? 0), video.createdAt && timeAgo(video.createdAt)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  );
}

interface TeraboxGridProps {
  listing: TeraboxPage;
  onPlay: (video: TeraboxListing) => void;
  onPage: (page: number) => void;
  busy: boolean;
}

function TeraboxGrid({ listing, onPlay, onPage, busy }: TeraboxGridProps) {
  const topRef = useRef<HTMLDivElement>(null);
  if (listing.total === 0) return <p className="py-16 text-center text-muted">No Terabox videos yet. Paste a link to watch one.</p>;
  return (
    <div ref={topRef} className="scroll-mt-16">
      <div aria-busy={busy} className={cn(videoGrid, 'pb-8 transition-opacity', busy && 'opacity-60')}>
        {listing.videos.map((video) => <TeraboxCard key={video.key} video={video} onPlay={() => onPlay(video)} />)}
      </div>
      <Pager
        page={listing.page}
        pages={listing.pages}
        busy={busy}
        onPage={(next) => {
          onPage(next);
          topRef.current?.scrollIntoView({ block: 'start' });
        }}
      />
    </div>
  );
}

function SortTabs({ sort, onSort }: { sort: TeraboxSort; onSort: (sort: TeraboxSort) => void }) {
  return (
    <div role="group" aria-label="Sort Terabox videos" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {SORTS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={sort === value}
          onClick={() => sort !== value && onSort(value)}
          className={cn(
            'inline-flex h-[34px] flex-none items-center rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors',
            sort === value ? 'border-fg bg-fg text-bg' : 'border-line bg-surface hover:border-fg-2',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const skeleton = (
  <div aria-hidden="true" className={videoGrid}>
    {Array.from({ length: SKELETON_CARDS }, (_, index) => (
      <div key={index} className="animate-pulse">
        <div className="aspect-video rounded-xl bg-surface-2" />
        <div className="mt-3 h-4 w-4/5 rounded bg-surface-2" />
        <div className="mt-2 h-3 w-1/2 rounded bg-surface-2" />
      </div>
    ))}
  </div>
);

// A saved video carries its key, so Up next can leave it out.
type Playing = TeraboxVideo & { key?: string; views?: number };

/** A saved video that was tapped and is still being fetched from Terabox, or failed to be. */
interface Opening {
  video: TeraboxListing;
  error: string;
}

function OpeningScreen({ opening, onRetry }: { opening: Opening; onRetry: () => void }) {
  const { video, error } = opening;
  return (
    <>
      {video.thumbnail && <img src={video.thumbnail} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-md" />}
      <div role={error ? 'alert' : 'status'} className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
        {error ? (
          <>
            <p className="max-w-[420px] text-[14.5px] font-medium">{error}</p>
            <button type="button" onClick={onRetry} className="h-10 rounded-full bg-white px-5 text-[14px] font-semibold text-black hover:opacity-90">
              Try again
            </button>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="size-11 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
            <p className="text-[14.5px] font-semibold">Getting your video from Terabox…</p>
            <p className="-mt-2 text-[12.5px] text-white/70">This can take up to a minute.</p>
          </>
        )}
      </div>
    </>
  );
}

interface TeraboxPlayerProps {
  video: Playing | null;
  opening: Opening | null;
  onRetry: () => void;
  linkForm: ReactNode;
}

function TeraboxPlayer({ video, opening, onRetry, linkForm }: TeraboxPlayerProps) {
  const title = opening?.video.title ?? video?.title ?? '';
  const views = opening ? opening.video.views : video?.views;
  return (
    <article className="min-w-0">
      <div className="relative -mx-4 aspect-video overflow-hidden bg-black sm:mx-0 sm:rounded-2xl">
        {opening || !video ? (
          opening && <OpeningScreen opening={opening} onRetry={onRetry} />
        ) : (
          <iframe
            key={video.play}
            src={`/player/?embed=1&endpoint=${encodeURIComponent(video.play)}`}
            title={video.title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        )}
      </div>
      <h1 title={title} className={watchTitle}>{title}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
        <CloudPlayIcon size={15} className="flex-none" />
        {['From Terabox', views != null && formatViews(views, { full: true })].filter(Boolean).join(' · ')}
      </p>
      {!opening && (
        <section aria-labelledby="terabox-new-title" className="mt-6 max-w-[560px]">
          <h2 id="terabox-new-title" className="mb-2.5 text-[16px] font-bold">Watch new video</h2>
          {linkForm}
        </section>
      )}
    </article>
  );
}

const failureOf = (err: unknown) => (err instanceof Error ? err.message : 'This video can’t be played right now.');

export default function TeraboxView({ initialLink = '', onInitialLink, onWatch, onViewed, listing, listingProblem, sort, onSort, onPage, listingBusy }: TeraboxViewProps) {
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setCanReadClipboard(Boolean(navigator.clipboard?.readText)), []);

  // Strict Mode runs effects twice; the ref keeps that from opening the link twice.
  const takenLinkRef = useRef('');
  // Only the latest pasted link or tapped video gets to play; earlier ones still loading are dropped.
  const requestRef = useRef(0);

  const submit = async (text: string) => {
    const result = parseTeraboxLink(text);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    const request = ++requestRef.current;
    setError('');
    setBusy(true);
    try {
      const video = await onWatch(result.link);
      if (request !== requestRef.current) return;
      setPlaying(video);
      setOpening(null);
      setLink('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (request === requestRef.current) setError(failureOf(err));
    } finally {
      setBusy(false);
    }
  };

  // Opens the watch page straight away, with the player loading, like following a link to a new page.
  const playSaved = async (saved: TeraboxListing) => {
    if (opening && !opening.error && opening.video.key === saved.key) return;
    const request = ++requestRef.current;
    setOpening({ video: saved, error: '' });
    setError('');
    window.scrollTo({ top: 0 });
    try {
      const result = parseTeraboxLink(saved.teraboxUrl);
      if ('error' in result) throw new Error(result.error);
      const video = await onWatch(result.link);
      if (request !== requestRef.current) return;
      setPlaying({ ...video, title: saved.title, poster: saved.thumbnail || video.poster, key: saved.key, views: saved.views + 1 });
      setOpening(null);
      onViewed?.(saved.key);
    } catch (err) {
      if (request === requestRef.current) setOpening({ video: saved, error: failureOf(err) });
    }
  };

  useEffect(() => {
    if (!initialLink || takenLinkRef.current === initialLink) return;
    takenLinkRef.current = initialLink;
    setLink(initialLink);
    submit(initialLink);
    onInitialLink?.();
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) submit(link);
  };

  const pasteFromClipboard = async () => {
    try {
      setLink(await navigator.clipboard.readText());
      setError('');
    } catch {
      inputRef.current?.focus();
      setError('Couldn’t read your clipboard. Long-press the box and choose Paste.');
    }
  };

  const linkForm = (
    <>
      <form onSubmit={onSubmit} aria-busy={busy} className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="terabox-link" className="sr-only">Terabox link</label>
        <div className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-2xl border border-line bg-surface pr-1.5 pl-4 focus-within:border-fg-2">
          <input
            id="terabox-link"
            ref={inputRef}
            type="url"
            inputMode="url"
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              setError('');
            }}
            placeholder="Paste Terabox link"
            autoComplete="off"
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'terabox-link-error' : undefined}
            className="min-w-0 flex-1 bg-transparent text-left text-[15px] text-fg outline-none placeholder:text-muted"
          />
          {link ? (
            <button
              type="button"
              onClick={() => {
                setLink('');
                setError('');
                inputRef.current?.focus();
              }}
              aria-label="Clear link"
              className="grid size-9 flex-none place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
            >
              <CloseIcon size={16} />
            </button>
          ) : canReadClipboard && (
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="inline-flex h-9 flex-none items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-[13px] font-semibold text-fg hover:bg-line"
            >
              <CopyIcon size={14} />
              Paste
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-12 flex-none rounded-2xl bg-fg px-6 text-[15px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Watch'}
        </button>
      </form>
      {busy && (
        <p role="status" className="mt-2.5 text-[13.5px] text-muted">Getting your video from Terabox. This can take up to a minute.</p>
      )}
      {error && (
        <p id="terabox-link-error" role="alert" className="mt-2.5 text-[13.5px] font-medium text-accent">{error}</p>
      )}
    </>
  );

  const browse = (
    <>
      <SortTabs sort={sort} onSort={onSort} />
      {listingProblem ?? (listing ? <TeraboxGrid listing={listing} onPlay={playSaved} onPage={onPage} busy={listingBusy} /> : skeleton)}
    </>
  );

  if (opening || playing) {
    const currentKey = opening?.video.key ?? playing?.key;
    const upNext = (listing?.videos ?? []).filter((video) => video.key !== currentKey).slice(0, UP_NEXT_LIMIT);
    return (
      <WatchLayout
        upNext={upNext.length > 0 && upNext.map((video) => <TeraboxCard key={video.key} video={video} onPlay={() => playSaved(video)} compact />)}
        moreVideos={browse}
      >
        <TeraboxPlayer video={playing} opening={opening} onRetry={() => opening && playSaved(opening.video)} linkForm={linkForm} />
      </WatchLayout>
    );
  }

  return (
    <div className="pt-5 pb-12">
      <section aria-labelledby="terabox-title" className="sm:pt-3 md:flex md:flex-col md:items-center md:py-10 md:text-center">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-sky-500 text-white shadow-sm">
          <CloudPlayIcon size={26} />
        </span>
        <h2 id="terabox-title" className="mt-4 font-display text-[24px] leading-tight font-extrabold sm:text-[28px]">
          Watch from Terabox
        </h2>
        <p className="mt-1.5 max-w-[460px] text-[14.5px] text-fg-2">
          Paste a Terabox share link to watch it here.
        </p>

        <div className="mt-5 md:w-full md:max-w-[560px]">{linkForm}</div>
      </section>

      <section aria-labelledby="terabox-saved-title" className="mt-9">
        <h2 id="terabox-saved-title" className={blockTitle}>Terabox videos</h2>
        {browse}
      </section>
    </div>
  );
}
