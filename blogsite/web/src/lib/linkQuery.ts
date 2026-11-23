'use client';

import { useMemo, useSyncExternalStore } from 'react';

declare global {
  interface Window {
    /** Set by /assets/js/query-parser.js: the page's full query before link parameters were trimmed. */
    LedgerQuery?: string;
  }
}

// /assets/js/query-parser.js runs in <head> on every full page load: it stores link parameters (token, type, t)
// in sessionStorage under this prefix, trims them from the address bar and leaves the full query in
// window.LedgerQuery. This store carries that on across pages opened inside the app.
const STORAGE_PREFIX = 'page-query:';

interface CurrentPage {
  path: string;
  query: string;
}

const EMPTY: CurrentPage = { path: '', query: '' };

let snapshot = EMPTY;
let restoreStored = true;
const listeners = new Set<() => void>();

function storedQuery(pathname: string, search: string): string | null {
  try { return sessionStorage.getItem(STORAGE_PREFIX + pathname + search); } catch { return null; }
}

if (typeof window !== 'undefined') {
  // Back/Forward returns to a page with its link parameters, like a back_forward page load did.
  window.addEventListener('popstate', () => {
    const { pathname, search } = window.location;
    if (pathname + search !== snapshot.path) restoreStored = true;
  });
}

/** Called after every navigation inside the app. */
export function syncLinkQuery(): void {
  const { pathname, search } = window.location;
  const path = pathname + search;
  if (path === snapshot.path) return;
  let query = search;
  if (snapshot === EMPTY) query = window.LedgerQuery ?? search;
  else if (restoreStored) query = storedQuery(pathname, search) ?? search;
  restoreStored = false;
  snapshot = { path, query };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useCurrentPage = () => useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

/** The page's full query, link parameters included. Empty while the page is being prerendered. */
export function useLinkQuery(): URLSearchParams {
  const { query } = useCurrentPage();
  return useMemo(() => new URLSearchParams(query), [query]);
}
