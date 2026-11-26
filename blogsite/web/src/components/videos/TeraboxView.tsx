'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';
import { parseTeraboxLink, type TeraboxLink } from '@/lib/teraboxLink';
import type { TeraboxListing, TeraboxPage, TeraboxVideo } from '@/lib/videos';
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
  /** The current page of saved Terabox videos, or null while the first one loads. */
  listing: TeraboxPage | null;
  /** Shown in place of the saved videos when they couldn't load. */
  listingProblem: ReactNode;
  onPage: (page: number) => void;
  /** Another page of saved videos is loading. */
  listingBusy: boolean;
}

const SKELETON_CARDS = 4;
const UP_NEXT_LIMIT = 6;

function TeraboxCard({ video, onPlay, disabled, compact = false }: { video: TeraboxListing; onPlay: () => void; disabled: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={disabled}
      className={cn('group block w-full min-w-0 text-left disabled:cursor-wait', compact && 'lg:flex lg:gap-2.5')}
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
        {video.createdAt && <span className={cn('text-[13px] text-muted', compact && 'lg:text-[12.5px]')}>{timeAgo(video.createdAt)}</span>}
      </span>
    </button>
  );
}

interface TeraboxGridProps {
  listing: TeraboxPage;
  onPlay: (video: TeraboxListing) => void;
  onPage: (page: number) => void;
  busy: boolean;
  /** A video is being opened, so the cards wait. */
  opening: boolean;
}

function TeraboxGrid({ listing, onPlay, onPage, busy, opening }: TeraboxGridProps) {
  const topRef = useRef<HTMLDivElement>(null);
  if (listing.total === 0) return <p className="py-16 text-center text-muted">No Terabox videos yet. Paste a link to watch one.</p>;
  return (
    <div ref={topRef} className="scroll-mt-16">
      <div aria-busy={busy} className={cn(videoGrid, 'pb-8 transition-opacity', busy && 'opacity-60')}>
        {listing.videos.map((video) => <TeraboxCard key={video.key} video={video} onPlay={() => onPlay(video)} disabled={opening} />)}
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

function TeraboxPlayer({ video, linkForm }: { video: TeraboxVideo; linkForm: ReactNode }) {
  return (
    <article className="min-w-0">
      <div className="relative -mx-4 aspect-video overflow-hidden bg-black sm:mx-0 sm:rounded-2xl">
        <iframe
          key={video.play}
          src={`/player/?embed=1&endpoint=${encodeURIComponent(video.play)}`}
          title={video.title}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
      <h1 title={video.title} className={watchTitle}>{video.title}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
        <CloudPlayIcon size={15} className="flex-none" />
        From Terabox
      </p>
      <section aria-labelledby="terabox-new-title" className="mt-6 max-w-[560px]">
        <h2 id="terabox-new-title" className="mb-2.5 text-[16px] font-bold">Watch new video</h2>
        {linkForm}
      </section>
    </article>
  );
}

export default function TeraboxView({ initialLink = '', onInitialLink, onWatch, listing, listingProblem, onPage, listingBusy }: TeraboxViewProps) {
  // A saved video carries its key, so Up next can leave it out.
  const [playing, setPlaying] = useState<(TeraboxVideo & { key?: string }) | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setCanReadClipboard(Boolean(navigator.clipboard?.readText)), []);

  // Strict Mode runs effects twice; the ref keeps that from opening the link twice.
  const takenLinkRef = useRef('');

  const submit = async (text: string, saved?: TeraboxListing) => {
    const result = parseTeraboxLink(text);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const video = await onWatch(result.link);
      setPlaying(saved ? { ...video, title: saved.title, poster: saved.thumbnail || video.poster, key: saved.key } : video);
      setLink('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This video can’t be played right now.');
    } finally {
      setBusy(false);
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

  const playSaved = (video: TeraboxListing) => {
    if (busy) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    submit(video.teraboxUrl, video);
  };

  const grid = listing && <TeraboxGrid listing={listing} onPlay={playSaved} onPage={onPage} busy={listingBusy} opening={busy} />;

  if (playing) {
    const upNext = (listing?.videos ?? []).filter((video) => video.key !== playing.key).slice(0, UP_NEXT_LIMIT);
    return (
      <WatchLayout
        upNext={upNext.length > 0 && upNext.map((video) => <TeraboxCard key={video.key} video={video} onPlay={() => playSaved(video)} disabled={busy} compact />)}
        moreVideos={grid}
      >
        <TeraboxPlayer video={playing} linkForm={linkForm} />
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
        {listingProblem ?? grid ?? skeleton}
      </section>
    </div>
  );
}
