'use client';

import { useEffect, useRef, useState } from 'react';
import { pushEpisodeUrl } from '@/lib/episodes';
import { videoUrl } from '@/lib/format';
import type { Episode } from '@/lib/videos';

interface EmbeddedPlayerProps {
  videoId: string;
  /** The API's signed play endpoint for this video. */
  endpoint: string;
  title: string;
  /** The requested episode (from 1), or 0 for the video's own source. */
  episode: number;
  /** Start position in seconds, from a copied "link at current time". */
  start: number;
  /** The player's episodes and the one it opened on (0-based, or -1), once it has loaded. */
  onEpisodes: (episodes: Episode[], playing: number) => void;
}

const MAX_EPISODES = 300;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

function readEpisodes(value: unknown): Episode[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_EPISODES).map((item) => ({
    title: text(item?.title, 120),
    poster: /^https?:\/\//i.test(text(item?.poster, 2000)) ? text(item.poster, 2000) : '',
  }));
}

function playerSrc(videoId: string, endpoint: string, episode: number, start: number) {
  // embed and share must come before endpoint, whose value the player reads to the end of the query.
  return `/player/?embed=1&share=${encodeURIComponent(videoUrl(videoId, episode))}`
    + `&endpoint=${encodeURIComponent(endpoint)}`
    + `${episode ? `&ep=${episode}` : ''}${start > 0 ? `&t=${Math.floor(start)}` : ''}`;
}

/**
 * The static player (/player/) in embed mode: it fetches the play endpoint itself and brings its own controls,
 * menus, chapters, resume and episode panel. Stream episodes switch inside the player (so fullscreen survives);
 * this page and the player tell each other which one is playing. An Iframe post's player can't switch in place,
 * so it is reloaded with the new episode instead. Key it by video id.
 */
export default function EmbeddedPlayer({ videoId, endpoint, title, episode, start, onEpisodes }: EmbeddedPlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState(() => playerSrc(videoId, endpoint, episode, start));
  const playingRef = useRef(episode);
  const wantedRef = useRef(episode);
  const inPlaceRef = useRef(true);
  const onEpisodesRef = useRef(onEpisodes);
  useEffect(() => { onEpisodesRef.current = onEpisodes; });

  const playInFrame = (next: number) => {
    playingRef.current = next;
    if (inPlaceRef.current) {
      frameRef.current?.contentWindow?.postMessage({ type: 'ledger-player:play-episode', episode: next }, window.location.origin);
    } else {
      setSrc(playerSrc(videoId, endpoint, next, 0));
    }
  };

  useEffect(() => {
    wantedRef.current = episode;
    if (episode > 0 && episode !== playingRef.current) playInFrame(episode);
  }, [episode]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const { type, episode: reported } = event.data ?? {};
      if (!Number.isInteger(reported)) return;
      if (type === 'ledger-player:ready') {
        playingRef.current = reported;
        inPlaceRef.current = event.data.inPlace !== false;
        onEpisodesRef.current(readEpisodes(event.data.episodes), reported - 1);
        // An episode picked on this page before the player had loaded.
        if (wantedRef.current > 0 && wantedRef.current !== reported) playInFrame(wantedRef.current);
      } else if (type === 'ledger-player:episode' && reported > 0) {
        playingRef.current = reported;
        pushEpisodeUrl(videoId, reported);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [videoId]);

  return (
    <div className="relative aspect-video overflow-hidden bg-black sm:rounded-2xl">
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
        allowFullScreen
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );
}
