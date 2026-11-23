'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { getSession } from '@/lib/session';

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'ready'; data: T };

interface Options {
  /**
   * Keep a result this long across remounts: Next.js remounts the page when `?v=` changes,
   * which would otherwise fetch it again on every video opened.
   */
  keepMs?: number;
}

const kept = new Map<string, { data: unknown; until: number }>();

function keptData(key: string | null): unknown {
  const entry = key === null ? undefined : kept.get(key);
  return entry && entry.until > Date.now() ? entry.data : undefined;
}

/**
 * Runs `load(request, token)` with the signed-in account's current token whenever the account or the request changes.
 * Keyed by account id rather than token, so the token renewal on each page load doesn't fetch twice.
 * `name` tells apart the loads that share the `keepMs` store.
 */
export function useAccountLoad<T>(
  name: string,
  accountId: string | null,
  request: string | null,
  load: (request: string, token: string) => Promise<T>,
  { keepMs = 0 }: Options = {},
): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value: Loaded<T> } | null>(null);
  const key = accountId !== null && request !== null ? `${name}\n${accountId}\n${request}\n${attempt}` : null;
  const cached = keepMs ? keptData(key) : undefined;

  useEffect(() => {
    const token = getSession()?.token;
    if (key === null || request === null || !token || cached !== undefined) return;
    let cancelled = false;
    load(request, token).then(
      (data) => {
        if (keepMs) kept.set(key, { data, until: Date.now() + keepMs });
        if (!cancelled) setResult({ key, value: { status: 'ready', data } });
      },
      (error) => {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
        setResult({ key, value: { status: 'error', message, retry: () => setAttempt((count) => count + 1) } });
      },
    );
    return () => { cancelled = true; };
  }, [key, request, load, keepMs, cached]);

  if (cached !== undefined) return { status: 'ready', data: cached as T };
  return result && result.key === key ? result.value : { status: 'loading' };
}
