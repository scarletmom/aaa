'use client';

import { type RefObject, useEffect, useState } from 'react';
import { attachSource } from '@/lib/videoEngines';
import type { VideoSource } from '@/lib/videos';

/**
 * Attaches the first working source to the video element, falling through to the next on a fatal error.
 * `attached` counts successful attaches, so callers can start playback when it changes.
 */
export function useStreamSource(videoRef: RefObject<HTMLVideoElement | null>, sources: VideoSource[]) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(sources.length === 0);
  const [attached, setAttached] = useState(0);
  const source = sources[sourceIndex];

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !source) return;
    const controller = new AbortController();
    const fail = () => {
      if (controller.signal.aborted) return;
      if (sourceIndex + 1 < sources.length) setSourceIndex(sourceIndex + 1);
      else setFailed(true);
    };

    attachSource(element, source, fail, controller.signal)
      .then((ok) => ok && setAttached((count) => count + 1))
      .catch(fail);

    return () => controller.abort();
  }, [videoRef, source, sourceIndex, sources.length, attempt]);

  const retry = () => {
    setFailed(false);
    setSourceIndex(0);
    setAttempt((count) => count + 1);
  };

  return { failed, retry, attached };
}
