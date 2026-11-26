'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { teraboxWatchUrl } from '@/lib/format';
import { canWatchVideos } from '@/lib/roles';
import { useHydrated, useSession } from '@/lib/session';
import { parseTeraboxLink } from '@/lib/teraboxLink';
import { CloseIcon, CopyIcon } from '../ui/Icons';

/** The paste box: checks the link here, then plays it on the videos page's Terabox tab. */
export default function TeraboxLaunch() {
  const router = useRouter();
  const hydrated = useHydrated();
  const session = useSession();
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const note = !hydrated || (session && canWatchVideos(session.role))
    ? 'The video opens in the player on the videos page. Large files can take up to a minute.'
    : session
      ? 'The Terabox Player is part of Member Lite and Pro. Open any video on our videos site and sign in from there to get Member Lite free.'
      : 'For Member Lite and Member Pro accounts. You’ll be asked to sign in, then the video plays.';

  useEffect(() => setCanReadClipboard(Boolean(navigator.clipboard?.readText)), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = parseTeraboxLink(link);
    if ('error' in result) {
      setError(result.error);
      inputRef.current?.focus();
      return;
    }
    setOpening(true);
    router.push(teraboxWatchUrl(result.link.url));
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

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="terabox-launch-link" className="sr-only">Terabox link</label>
        <div className="flex h-14 min-w-0 flex-1 items-center gap-1 rounded-full border border-line bg-surface pr-2 pl-5 shadow-sm focus-within:border-fg-2">
          <input
            id="terabox-launch-link"
            ref={inputRef}
            type="url"
            inputMode="url"
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              setError('');
            }}
            placeholder="Paste a Terabox share link"
            autoComplete="off"
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'terabox-launch-error' : 'terabox-launch-note'}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-muted"
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
              className="grid size-10 flex-none place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
            >
              <CloseIcon size={16} />
            </button>
          ) : canReadClipboard && (
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="inline-flex h-10 flex-none items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[14px] font-semibold text-fg hover:bg-line"
            >
              <CopyIcon size={14} />
              Paste
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={opening}
          className="h-14 flex-none rounded-full bg-accent px-8 text-[16px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {opening ? 'Opening…' : 'Watch'}
        </button>
      </form>
      {error ? (
        <p id="terabox-launch-error" role="alert" className="mt-3 text-[14px] font-medium text-accent">{error}</p>
      ) : (
        <p id="terabox-launch-note" className="mt-3 text-[14px] text-muted">{note}</p>
      )}
    </div>
  );
}
