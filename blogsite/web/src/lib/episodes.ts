import { videoUrl } from './format';
import type { CatalogVideo } from './videos';

/** Puts ?ep= in the address with the History API: a Next.js navigation would remount the page and reload the player. */
export function pushEpisodeUrl(videoId: string, episode: number) {
  window.history.pushState(null, '', videoUrl(videoId, episode));
}

/**
 * Which episode is playing (0-based), or -1 when the video has none.
 * `?ep=N` (from 1) picks one; without it, `playing` is the one the player reported as its default.
 */
export function episodeIndex(video: CatalogVideo, requested: number, playing: number): number {
  if (!video.episodes.length) return -1;
  if (requested >= 1 && requested <= video.episodes.length) return requested - 1;
  return playing;
}

export const episodeLabel = (video: CatalogVideo, index: number) => video.episodes[index]?.title || String(index + 1);

export function episodeName(video: CatalogVideo, index: number): string {
  const label = episodeLabel(video, index);
  return /^\d+$/.test(label) ? `Episode ${label}` : label;
}

export const titleWithEpisode = (video: CatalogVideo, index: number) =>
  (index >= 0 ? `${video.title} · ${episodeName(video, index)}` : video.title);
