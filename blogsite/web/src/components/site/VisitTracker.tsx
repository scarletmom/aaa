'use client';

import { useEffect, useRef } from 'react';
import { useCurrentPage } from '@/lib/linkQuery';

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

// Gate tokens and stream links ride at the end of the query string; they never leave the page.
const withoutSecrets = (url: string) => url.replace(/[?&](?:token|endpoint|url|startapp)=[^]*$/, '');

function visitorId(): string {
  try {
    let id = localStorage.getItem('vid') || '';
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('vid', id);
    }
    return id;
  } catch {
    return '';
  }
}

function sendVisit(apiUrl: string, path: string, referrer: string) {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection ?? {};
  const body = {
    path: withoutSecrets(path),
    referrer: withoutSecrets(referrer),
    visitorId: visitorId(),
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    connection: { effectiveType: connection.effectiveType, downlink: connection.downlink, rtt: connection.rtt },
  };
  // A plain string body is sent as text/plain, which needs no CORS preflight.
  fetch(`${apiUrl.replace(/\/+$/, '')}/api/visit`, {
    method: 'POST', body: JSON.stringify(body), keepalive: true, credentials: 'omit',
  }).catch(() => {});
}

/** One page view per page shown, including pages opened without a reload. */
export default function VisitTracker({ apiUrl }: { apiUrl?: string }) {
  const { path } = useCurrentPage();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!path || !apiUrl || !/^https?:\/\//.test(apiUrl) || path === lastPath.current) return;
    sendVisit(apiUrl, path, lastPath.current ? window.location.origin + lastPath.current : document.referrer);
    lastPath.current = path;
  }, [apiUrl, path]);

  return null;
}
