'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageSearchError, searchVideosByImage } from '@/lib/imageSearch';

export interface ImageSearch {
  previewUrl: string;
  name: string;
  status: 'loading' | 'done' | 'error';
  /** Matching video ids, best first. */
  ids: string[];
  error: string;
}

/** The current search-by-image: the picture, and the backend's answer once it comes. */
export function useImageSearch() {
  const [search, setSearch] = useState<ImageSearch | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const previewUrl = search?.previewUrl;

  // Each search makes a blob URL for its preview; free it once that search is replaced or cleared.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = (file: File) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const url = URL.createObjectURL(file);
    setSearch({ previewUrl: url, name: file.name || 'Pasted image', status: 'loading', ids: [], error: '' });

    const settle = (update: Partial<ImageSearch>) => {
      if (!controller.signal.aborted) setSearch((current) => (current?.previewUrl === url ? { ...current, ...update } : current));
    };
    searchVideosByImage(file, controller.signal).then(
      (ids) => settle({ status: 'done', ids }),
      (error) => settle({
        status: 'error',
        error: error instanceof ImageSearchError ? error.message : 'Image search didn’t work. Please try again.',
      }),
    );
  };

  const clear = () => {
    controllerRef.current?.abort();
    setSearch(null);
  };

  return { search, start, clear };
}
