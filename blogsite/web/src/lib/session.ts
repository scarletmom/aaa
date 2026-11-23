'use client';

import { useSyncExternalStore } from 'react';
import type { Account } from './auth';
import { DEFAULT_ROLE, isRole } from './roles';

const SESSION_KEY = 'quillwood-session';

export type Session = Account;

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedSession: Session | null = null;

function parse(raw: string | null): Session | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    // Sessions from before the server existed have no token and count as signed out.
    if (typeof value?.name !== 'string' || !value.name || typeof value.token !== 'string' || !value.token) return null;
    return {
      id: typeof value.id === 'string' ? value.id : '',
      name: value.name,
      role: isRole(value.role) ? value.role : DEFAULT_ROLE,
      proUntil: typeof value.proUntil === 'string' ? value.proUntil : null,
      adFree: typeof value.adFree === 'string' ? value.adFree : null,
      token: value.token,
    };
  } catch {
    return null;
  }
}

// Re-parses only when the stored string changes, so React gets the same object between renders.
function readSession(): Session | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SESSION_KEY); } catch { /* storage unavailable */ }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parse(raw);
  }
  return cachedSession;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Other tabs signing in or out fire `storage` here.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function write(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}

export const getSession = () => readSession();
export const saveSession = (session: Session) => write(session);
export const clearSession = () => write(null);

/** The signed-in user, or null. Always null during server rendering and hydration. */
export const useSession = () => useSyncExternalStore(subscribe, readSession, () => null);

const noSubscription = () => () => {};

/** False while rendering on the server and hydrating, when the session can't be read yet. */
export const useHydrated = () => useSyncExternalStore(noSubscription, () => true, () => false);
