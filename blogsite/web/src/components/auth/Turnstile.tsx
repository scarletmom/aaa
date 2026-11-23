'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { loadScript } from '@/lib/loadScript';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// The key must match the secret the server verifies with, so it comes from the server unless set at build time.
let siteKeyRequest: Promise<string> | null = null;
function siteKey(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (configured) return Promise.resolve(configured);
  siteKeyRequest ||= apiRequest<{ sitekey: string }>('/api/config').then(({ sitekey }) => sitekey);
  siteKeyRequest.catch(() => { siteKeyRequest = null; });
  return siteKeyRequest;
}
const NORMAL_WIDGET_WIDTH = 300;

interface TurnstileOptions {
  sitekey: string;
  theme: 'light' | 'dark';
  size: 'flexible' | 'compact';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: TurnstileOptions): string;
      remove(widgetId: string): void;
    };
  }
}

/** Cloudflare Turnstile check. `onToken` must be stable (e.g. a state setter); it gets '' when the token lapses. */
export default function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    Promise.all([siteKey(), loadScript(SCRIPT_SRC)])
      .then(([sitekey]) => {
        const container = containerRef.current;
        if (cancelled || !container || !window.turnstile) return;
        widgetId = window.turnstile.render(container, {
          sitekey,
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
          size: container.offsetWidth < NORMAL_WIDGET_WIDTH ? 'compact' : 'flexible',
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
      onToken('');
    };
  }, [onToken]);

  if (failed) {
    return (
      <p role="alert" className="text-center text-[14px] text-accent">
        The security check couldn&apos;t load. Check your connection and reopen this window.
      </p>
    );
  }
  return <div ref={containerRef} className="flex min-h-[65px] w-full justify-center" />;
}
