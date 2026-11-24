import site from '@/data/site.json';
import { ApiError, apiRequest } from './api';

export type SourceType = 'hls' | 'dash' | 'native';

export interface VideoSource {
  url: string;
  type: SourceType;
}

/** An episode as the embedded player reports it; its stream URL stays inside the player. */
export interface Episode {
  title: string;
  poster: string;
}

export interface CatalogVideo {
  id: string;
  title: string;
  description: string;
  channel: string;
  poster: string;
  tags: string[];
  publishedAt: string | null;
  /** A scheduled live stream's start; it can't be played before then. */
  startsAt: string | null;
  live: boolean;
  /** Total views; for a live stream, people watching now. */
  views: number | null;
  /** A vertical clip shown in the Shorts shelf instead of the main grid. */
  short: boolean;
  duration: string | null;
  /** Streams this page plays itself (shorts); other videos play in the embedded player from their play endpoint. */
  sources: VideoSource[];
  /** Filled in once the embedded player has loaded the video and reported them. */
  episodes: Episode[];
}

/** A video as the API returns it; the real URL stays on the server. */
interface ApiVideo {
  tag: string;
  title: string;
  thumbnail: string;
  description: string;
  views: number;
  durationSeconds: number | null;
  createdAt: string | null;
  category: { name: string } | null;
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

function formatDuration(totalSeconds: number | null): string | null {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = twoDigits(seconds % 60);
  return hours ? `${hours}:${twoDigits(minutes)}:${rest}` : `${minutes}:${rest}`;
}

function toCatalogVideo(video: ApiVideo): CatalogVideo {
  return {
    id: video.tag,
    title: video.title,
    description: video.description ?? '',
    channel: video.category?.name ?? '',
    poster: video.thumbnail ?? '',
    tags: [],
    publishedAt: video.createdAt ?? null,
    startsAt: null,
    live: false,
    views: Number.isFinite(video.views) ? video.views : null,
    short: false,
    duration: formatDuration(video.durationSeconds),
    sources: [],
    episodes: [],
  };
}

/** Every published video. Needs a Member Lite or Pro account token. */
export async function fetchVideos(token: string): Promise<CatalogVideo[]> {
  const { videos } = await apiRequest<{ videos: ApiVideo[] }>('/api/videos', { token });
  return videos.map(toCatalogVideo);
}

export interface VideoDetail {
  video: CatalogVideo;
  /** A signed endpoint the player fetches for the stream; it expires after a few hours. */
  play: string;
}

/** One video and its play endpoint. Each call counts a view. */
export async function fetchVideo(id: string, token: string): Promise<VideoDetail> {
  const detail = await apiRequest<{ video: ApiVideo; play?: string }>(`/api/videos/${encodeURIComponent(id)}`, { token });
  return { video: toCatalogVideo(detail.video), play: detail.play ?? '' };
}

export interface TeraboxVideo {
  title: string;
  poster: string;
  /** A blob: URL holding the player's endpoint JSON; its stream links carry tokens that expire after a few minutes. */
  play: string;
}

interface TeraboxFile {
  name?: unknown;
  type?: unknown;
  thumbnail?: unknown;
  subtitle_url?: unknown;
  fast_stream_url?: unknown;
}

interface TeraboxReply {
  result?: string;
  data?: { status?: string; error?: string; list?: TeraboxFile[] } | Record<string, unknown> | string;
}

const TERABOX_NOT_READY = 'Couldn’t reach Terabox. Check your connection and try again.';
const TERABOX_FAILED = 'This Terabox video couldn’t be opened. Check the link and try again in a moment.';
const TERABOX_BUSY = 'Terabox videos are busy right now. Please try again in a few hours.';
const VIDEO_EXTENSION = /\.(mp4|mkv|mov|avi|webm|m4v|ts|flv|wmv|3gp)$/i;

const httpUrl = (value: unknown) => (typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : '');
const heightOf = (label: string) => Number(/(\d{3,4})\s*p/i.exec(label)?.[1]) || 0;

function qualitiesOf(file: TeraboxFile) {
  const streams = file.fast_stream_url && typeof file.fast_stream_url === 'object' ? Object.entries(file.fast_stream_url) : [];
  return streams
    .map(([label, url]) => ({ label, url: httpUrl(url) }))
    .filter((quality) => quality.url)
    .sort((a, b) => heightOf(b.label) - heightOf(a.label));
}

/** One call to the Terabox worker, which gets cookies and the share's streams from Cloudflare's network. Needs an account token. */
export async function openTerabox(url: string, token: string): Promise<TeraboxVideo> {
  const endpoint = new URL(site.teraboxUrl ?? '');
  endpoint.searchParams.set('url', url);

  let response: Response;
  let reply: TeraboxReply;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'omit',
      cache: 'no-store',
    });
    reply = await response.json();
  } catch {
    throw new ApiError(TERABOX_NOT_READY, 0);
  }

  if (response.status === 401) throw new ApiError('Your session has ended. Sign in again to watch Terabox links.', 401);
  if (!response.ok || reply.result !== 'OK' || typeof reply.data !== 'object' || reply.data?.status !== 'success') {
    const detail = JSON.stringify(reply.data ?? '');
    const busy = /usage_limit|"error":"rate|\b429\b/i.test(detail);
    throw new ApiError(busy ? TERABOX_BUSY : TERABOX_FAILED, response.status);
  }

  const files = Array.isArray(reply.data.list) ? (reply.data.list as TeraboxFile[]) : [];
  const file = files.find((item) => item.type === 'video' && qualitiesOf(item).length) ?? files.find((item) => qualitiesOf(item).length);
  if (!file) throw new ApiError('This Terabox link has no video to play.', 404);

  const qualities = qualitiesOf(file);
  const title = (typeof file.name === 'string' ? file.name.trim().replace(VIDEO_EXTENSION, '').slice(0, 200) : '') || 'Terabox video';
  const poster = httpUrl(file.thumbnail);
  const subtitle = httpUrl(file.subtitle_url);
  const meta = {
    title,
    poster,
    source: { url: qualities[0].url, qualities },
    ...(subtitle && { subtitles: [{ url: subtitle, label: 'Subtitles' }] }),
  };
  const play = URL.createObjectURL(new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  return { title, poster, play };
}
