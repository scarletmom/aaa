import { loadScript } from './loadScript';
import type { VideoSource } from './videos';

// Same versions as the static player (/player/).
const HLS_SRC = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
const DASH_SRC = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';

interface HlsInstance {
  loadSource(url: string): void;
  attachMedia(video: HTMLVideoElement): void;
  on(event: string, handler: (event: string, data: { fatal?: boolean }) => void): void;
  destroy(): void;
}

interface DashPlayer {
  initialize(video: HTMLVideoElement, url: string, autoPlay: boolean): void;
  on(event: string, handler: () => void): void;
  reset(): void;
}

declare global {
  interface Window {
    Hls?: { new (config?: object): HlsInstance; isSupported(): boolean; Events: { ERROR: string } };
    dashjs?: { MediaPlayer(): { create(): DashPlayer } };
  }
}

type Detach = () => void;

function attachNative(video: HTMLVideoElement, url: string, onFatal: () => void): Detach {
  video.addEventListener('error', onFatal);
  video.src = url;
  return () => {
    video.removeEventListener('error', onFatal);
    video.removeAttribute('src');
    video.load();
  };
}

// hls.js handles more streams than browsers' built-in HLS, so it's preferred wherever Media Source works.
const hasMediaSource = () => 'MediaSource' in window || 'ManagedMediaSource' in window;

function attachHls(video: HTMLVideoElement, url: string, onFatal: () => void): Detach {
  const Hls = window.Hls;
  if (!Hls?.isSupported()) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) return attachNative(video, url, onFatal);
    throw new Error('HLS is not supported in this browser');
  }
  const hls = new Hls({ enableWorker: true });
  hls.on(Hls.Events.ERROR, (_, data) => {
    if (data.fatal) onFatal();
  });
  hls.loadSource(url);
  hls.attachMedia(video);
  return () => hls.destroy();
}

function attachDash(video: HTMLVideoElement, url: string, onFatal: () => void): Detach {
  if (!window.dashjs) throw new Error('DASH is not supported in this browser');
  const player = window.dashjs.MediaPlayer().create();
  player.on('error', onFatal);
  player.initialize(video, url, true);
  return () => player.reset();
}

async function loadEngine(source: VideoSource) {
  if (source.type === 'hls' && hasMediaSource()) await loadScript(HLS_SRC);
  else if (source.type === 'dash') await loadScript(DASH_SRC);
  // Always yields first, so an attempt cancelled in the same tick never touches the element.
  else await Promise.resolve();
}

/**
 * Plays `source` in `video` until `signal` aborts. Resolves to false if it was aborted before attaching.
 * `onFatal` fires if the stream breaks after it starts.
 */
export async function attachSource(video: HTMLVideoElement, source: VideoSource, onFatal: () => void, signal: AbortSignal): Promise<boolean> {
  await loadEngine(source);
  if (signal.aborted) return false;
  const attach = source.type === 'hls' ? attachHls : source.type === 'dash' ? attachDash : attachNative;
  signal.addEventListener('abort', attach(video, source.url, onFatal), { once: true });
  return true;
}
