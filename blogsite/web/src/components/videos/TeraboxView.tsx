'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { parseTeraboxLink, type TeraboxLink } from '@/lib/teraboxLink';
import type { CatalogVideo, TeraboxVideo } from '@/lib/videos';
import { CloseIcon, CloudPlayIcon, CopyIcon } from '../ui/Icons';
import { blockTitle, videoGrid, watchTitle } from './styles';
import { WatchLayout } from './WatchView';

interface TeraboxViewProps {
  /** Resolves the link to something playable; a rejection's message is shown under the box. */
  onWatch: (link: TeraboxLink) => Promise<TeraboxVideo>;
  /** Suggested next while a Terabox video plays. */
  upNext: CatalogVideo[];
  /** The home page's catalogue, or null while it loads. */
  moreVideos: ReactNode;
}

const SKELETON_CARDS = 4;

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
      <div className="mt-4 max-w-[560px]">{linkForm}</div>
    </article>
  );
}

export default function TeraboxView({ onWatch, upNext, moreVideos }: TeraboxViewProps) {
  const [playing, setPlaying] = useState<TeraboxVideo | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setCanReadClipboard(Boolean(navigator.clipboard?.readText)), []);

  const submit = async (text: string) => {
    const result = parseTeraboxLink(text);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError('');
    setBusy(true);
    try {
      setPlaying(await onWatch(result.link));
      setLink('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This video can’t be played right now.');
    } finally {
      setBusy(false);
    }
  };

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

  const linkForm = (compact: boolean) => (
    <>
      <form onSubmit={onSubmit} aria-busy={busy} className={cn('flex gap-2', compact ? 'flex-row' : 'flex-col gap-2.5 sm:flex-row')}>
        <label htmlFor="terabox-link" className="sr-only">Terabox link</label>
        <div className={cn('flex min-w-0 flex-1 items-center gap-1 border border-line bg-surface pr-1.5 focus-within:border-fg-2', compact ? 'h-10 rounded-full pl-3.5' : 'h-12 rounded-2xl pl-4')}>
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
            placeholder={compact ? 'Paste another Terabox link' : 'Paste Terabox link'}
            autoComplete="off"
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'terabox-link-error' : undefined}
            className={cn('min-w-0 flex-1 bg-transparent text-left text-fg outline-none placeholder:text-muted', compact ? 'text-[14px]' : 'text-[15px]')}
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
              className={cn('grid flex-none place-items-center text-muted hover:bg-surface-2 hover:text-fg', compact ? 'size-7 rounded-full' : 'size-9 rounded-xl')}
            >
              <CloseIcon size={16} />
            </button>
          ) : canReadClipboard && (
            <button
              type="button"
              onClick={pasteFromClipboard}
              className={cn('inline-flex flex-none items-center gap-1.5 bg-surface-2 px-3 text-[13px] font-semibold text-fg hover:bg-line', compact ? 'h-7 rounded-full' : 'h-9 rounded-xl')}
            >
              <CopyIcon size={14} />
              Paste
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className={cn('flex-none bg-fg font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60', compact ? 'h-10 rounded-full px-5 text-[14px]' : 'h-12 rounded-2xl px-6 text-[15px]')}
        >
          {busy ? 'Opening…' : compact ? 'Play' : 'Watch'}
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

  if (playing) {
    return (
      <WatchLayout upNext={upNext} moreVideos={moreVideos}>
        <TeraboxPlayer video={playing} linkForm={linkForm(true)} />
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

        <div className="mt-5 md:w-full md:max-w-[560px]">{linkForm(false)}</div>
      </section>

      {moreVideos ? (
        <section aria-labelledby="terabox-more" className="mt-9">
          <h2 id="terabox-more" className={blockTitle}>More videos</h2>
          {moreVideos}
        </section>
      ) : (
        <div aria-hidden="true" className={`${videoGrid} mt-9`}>
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-video rounded-xl bg-surface-2" />
              <div className="mt-3 h-4 w-4/5 rounded bg-surface-2" />
              <div className="mt-2 h-3 w-1/2 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
