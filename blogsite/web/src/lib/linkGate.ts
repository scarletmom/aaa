import type { LinkGateSettings, LinkGateText } from './types';

const DEFAULTS = {
  countdownSeconds: 10,
  method: 'GET',
  header: 'Authorization',
  scheme: 'Bearer',
};
const TEXT: LinkGateText = {
  banner: 'Your link is ready.',
  bannerButton: 'Continue to link',
  title: 'Your link is almost ready',
  intro: 'Press the button below, wait a few seconds, then get your link.',
  start: 'Click here',
  waiting: 'Please wait {s} seconds…',
  get: 'Click here to get link',
  loading: 'Getting your link…',
  redirecting: 'Redirecting…',
  expired: 'This link has expired. Go back and request a new one.',
  invalid: 'This link isn’t valid.',
  unreachable: 'Couldn’t reach the link server. It may be offline, or it may not allow requests from this site (CORS).',
  serverError: 'The link server returned an error (HTTP {status}).',
  noLink: 'The link server didn’t return a link.',
  retry: 'Try again',
};
const REQUEST_TIMEOUT_MS = 15000;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

interface TokenPayload {
  fetchurl?: unknown;
  fetchUrl?: unknown;
  step?: unknown;
  pages?: unknown;
  exp?: unknown;
}

export interface Gate {
  token: string;
  payload: TokenPayload | null;
  fetchUrl: URL | null;
  config: { method: string; header: string; scheme: string; allowedOrigins: string[] };
  text: LinkGateText;
  seconds: number;
  problem: string;
  stepText: string;
}

// Reads the JWT payload only. The signature can't be checked here (it needs the server's secret);
// the server verifies it when the token comes back in the request header.
function decodePayload(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as TokenPayload) : null;
  } catch {
    return null;
  }
}

function httpUrl(value: unknown, base?: string): URL | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return HTTP_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

const originAllowed = (url: URL, allowed: string[]) =>
  !allowed.length || allowed.includes(url.origin) || (allowed.includes('self') && url.origin === window.location.origin);

export const isExpired = (payload: TokenPayload | null) =>
  typeof payload?.exp === 'number' && Number.isFinite(payload.exp) && payload.exp * 1000 <= Date.now();

export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

/** Browser only: resolves the token against document.baseURI and the allowed origins. */
export function describeGate(token: string, settings: LinkGateSettings = {}): Gate {
  const config = {
    method: settings.method ?? DEFAULTS.method,
    header: settings.header ?? DEFAULTS.header,
    scheme: settings.scheme ?? DEFAULTS.scheme,
    allowedOrigins: Array.isArray(settings.allowedOrigins) ? settings.allowedOrigins : [],
  };
  const text = { ...TEXT, ...settings.text };
  const seconds = Math.max(0, Math.round(Number(settings.countdownSeconds ?? DEFAULTS.countdownSeconds) || 0));

  const payload = decodePayload(token);
  const fetchUrl = payload && httpUrl(payload.fetchurl ?? payload.fetchUrl, document.baseURI);
  let problem = '';
  if (!payload || !fetchUrl || !originAllowed(fetchUrl, config.allowedOrigins)) problem = text.invalid;
  else if (isExpired(payload)) problem = text.expired;

  const step = Number(payload?.step);
  const pages = Number(payload?.pages);
  const stepText = Number.isFinite(step) && Number.isFinite(pages) && pages > 0 ? `Step ${step} of ${pages}` : '';

  return { token, payload, fetchUrl, config, text, seconds, problem, stepText };
}

// Accepts { "url": … } (or redirect/location/link, optionally inside "data"), a JSON string, or a plain-text URL.
async function readTarget(response: Response): Promise<URL | null> {
  const body = (await response.text()).trim();
  let candidate: unknown = body;
  if (/json/i.test(response.headers.get('content-type') || '') || /^[{["]/.test(body)) {
    try {
      const data: unknown = JSON.parse(body);
      if (typeof data === 'string') {
        candidate = data;
      } else if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>;
        const source = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record;
        candidate = source.url ?? source.redirect ?? source.location ?? source.link ?? '';
      }
    } catch { /* not JSON after all; treat the body as text */ }
  }
  const target = httpUrl(candidate, response.url);
  if (target) return target;
  return response.redirected ? httpUrl(response.url) : null;
}

async function requestLink({ fetchUrl, token, config }: Gate & { fetchUrl: URL }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(fetchUrl.href, {
      method: config.method,
      headers: { [config.header]: config.scheme ? `${config.scheme} ${token}` : token },
      credentials: 'omit',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves to { target } on success or { error } with the message to show. */
export async function fetchLink(gate: Gate): Promise<{ target: URL } | { error: string }> {
  const { text, fetchUrl } = gate;
  if (!fetchUrl) return { error: text.invalid };
  try {
    const response = await requestLink({ ...gate, fetchUrl });
    if (!response.ok) return { error: fill(text.serverError, { status: response.status }) };
    const target = await readTarget(response);
    return target ? { target } : { error: text.noLink };
  } catch {
    return { error: text.unreachable };
  }
}
