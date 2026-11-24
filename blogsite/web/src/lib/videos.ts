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
  /** The player's endpoint for the resolved streams; it lasts a few minutes. */
  play: string;
}

const TERABOX_NOT_READY = 'Couldn’t get Terabox ready. Check your connection and try again.';

// Fetched here rather than on the server: the cookie service blocks server IPs but not visitors'.
async function fetchTeraboxCookies(token: string): Promise<string[]> {
  let body: { data?: unknown };
  try {
    const response = await fetch(site.teraboxCookieUrl, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`cookie service answered ${response.status}`);
    body = await response.json();
  } catch {
    throw new ApiError(TERABOX_NOT_READY, 0);
  }
  const cookies = Array.isArray(body.data) ? body.data.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
  if (!cookies.length) throw new ApiError(TERABOX_NOT_READY, 0);
  return cookies;
}

/** Gets Terabox cookies in this browser, then runs the share link through the server. Needs a Member Lite or Pro account token. */
export async function openTerabox(url: string, token: string): Promise<TeraboxVideo> {
  const data = await fetchTeraboxCookies(token);
  return apiRequest<TeraboxVideo>('/api/terabox', { method: 'POST', body: { url, data }, token });
}
