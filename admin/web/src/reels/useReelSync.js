import { useEffect, useRef } from "react";
import { saveReel, withoutTransient } from "../lib/reels.js";

const SAVE_DELAY_MS = 700;
const keyOf = (draft) => `${draft.id}:${JSON.stringify(withoutTransient(draft))}`;

// Mirrors the draft to its saved reel. Only changes made here are sent, so a copy this browser kept
// never overwrites newer progress made on another device.
export function useReelSync(draft, update, onError) {
  const synced = useRef(draft.id ? keyOf(draft) : null);
  const pending = useRef(null);
  const timer = useRef(null);
  const latest = useRef({ update, onError });
  latest.current = { update, onError };

  const flush = (keepalive = false) => {
    clearTimeout(timer.current);
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    saveReel(job.id, job.draft, { keepalive }).catch((err) => {
      if (err.status === 404) latest.current.update((current) => (current.id === job.id ? { id: null } : {}));
      else latest.current.onError?.(err);
    });
  };

  useEffect(() => {
    if (!draft.id) {
      flush();
      return;
    }
    const key = keyOf(draft);
    if (key === synced.current) return;
    synced.current = key;
    pending.current = { id: draft.id, draft };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [draft]);

  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
  }, []);

  // For a draft that was just loaded from the server, so it isn't sent straight back.
  return (loaded) => {
    synced.current = loaded.id ? keyOf(loaded) : null;
  };
}
