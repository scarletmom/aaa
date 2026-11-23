export const SEARCH_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** A failure whose message is safe to show to the user. */
export class ImageSearchError extends Error {}

/** Why `file` can't be used for a search, or null if it can. */
export function checkSearchImage(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'That file isn’t an image. Try a JPG, PNG, WebP or GIF.';
  if (file.size > SEARCH_IMAGE_MAX_BYTES) return 'That image is over 10 MB. Try a smaller one.';
  return null;
}

/** The first image in a paste or drop, if any. */
export const imageFrom = (data: DataTransfer | null) => [...(data?.files ?? [])].find((file) => file.type.startsWith('image/')) ?? null;

/**
 * Searches videos by an image and resolves to the matching video ids (stream file names, e.g. "big-buck-bunny"),
 * best match first. Not connected yet: replace the body with the call to the image-search backend, and throw an
 * ImageSearchError for problems the viewer should read.
 */
export async function searchVideosByImage(image: File, signal: AbortSignal): Promise<string[]> {
  void image;
  await new Promise((resolve) => setTimeout(resolve, 900));
  if (signal.aborted) return [];
  throw new ImageSearchError('Image search isn’t connected yet. Results will show here once it is.');
}
