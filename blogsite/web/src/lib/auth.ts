import { apiRequest } from './api';
import { DEFAULT_ROLE, isRole, type Role } from './roles';
import { clearSession, getSession } from './session';

export { ApiError as AuthError } from './api';

// xxxx-xxxx-xxxx-xxxx, or the UUID that older accounts were given.
const ACCOUNT_NUMBER_PATTERN = /^(?:[0-9a-f]{4}(?:-[0-9a-f]{4}){3}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const isAccountNumber = (value: string) => ACCOUNT_NUMBER_PATTERN.test(value.trim());

export interface Account {
  /** Stable, non-secret id (a hash of the account number), used to tag the viewer's own comments and likes. */
  id: string;
  name: string;
  role: Role;
  /** When a bought Pro pass ends (ISO time); null for Pro that never ends and for other roles. */
  proUntil: string | null;
  /** The server-signed pass that turns ads off (Member Pro only); checked with lib/adFree, never trusted as-is. */
  adFree: string | null;
  /** The server's account JWT. */
  token: string;
}

export interface Registered {
  account: Account;
  /** The new login key, shown once. */
  accountNumber: string;
}

interface SessionResponse {
  token: string;
  id?: string;
  /** Only in the register answer; older servers sent it every time. */
  accountNumber?: string;
  name: string;
  role: string;
  proUntil?: string | null;
  adFree?: string | null;
}

async function hashAccountNumber(accountNumber: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accountNumber.toLowerCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function toAccount(response: SessionResponse): Promise<Account> {
  return {
    id: response.id || (response.accountNumber ? await hashAccountNumber(response.accountNumber) : ''),
    name: response.name,
    role: isRole(response.role) ? response.role : DEFAULT_ROLE,
    proUntil: typeof response.proUntil === 'string' ? response.proUntil : null,
    adFree: typeof response.adFree === 'string' ? response.adFree : null,
    token: response.token,
  };
}

export async function signIn({ accountNumber, captchaToken }: { accountNumber: string; captchaToken: string }): Promise<Account> {
  const response = await apiRequest<SessionResponse>('/api/login', {
    method: 'POST',
    body: { accountNumber: accountNumber.trim(), captcha: captchaToken },
  });
  return toAccount(response);
}

/** With the videos site's pass the account is Member Lite; without it, a plain Member. */
export async function register({ fullName, captchaToken, videosPass }: { fullName: string; captchaToken: string; videosPass?: string }): Promise<Registered> {
  const response = await apiRequest<SessionResponse>('/api/register', {
    method: 'POST',
    body: { fullname: fullName, captcha: captchaToken },
    token: videosPass,
  });
  return { account: await toAccount(response), accountNumber: response.accountNumber ?? '' };
}

/** Re-reads the role from the server and renews the token; rejects with status 401 once the session is no longer valid. */
export async function refreshAccount(account: Account): Promise<Account> {
  return toAccount(await apiRequest<SessionResponse>('/api/account', { token: account.token }));
}

/** Signs this device out here and on the server, which frees its place under the account's device limit. */
export function logOut() {
  const session = getSession();
  clearSession();
  if (session) apiRequest('/api/logout', { method: 'POST', token: session.token }).catch(() => {});
}

/** Signs out every other device and token; resolves to this device's new session. Needs the current number too. */
export async function signOutOtherDevices(account: Account, accountNumber: string): Promise<Account> {
  return toAccount(await apiRequest<SessionResponse>('/api/account/sign-out-others', {
    method: 'POST',
    body: { accountNumber: accountNumber.trim() },
    token: account.token,
  }));
}

/** Swaps a leaked account number for a new one (shown once); the old number and every other session stop working. */
export async function changeAccountNumber(account: Account, accountNumber: string): Promise<Registered> {
  const response = await apiRequest<SessionResponse>('/api/account/new-number', {
    method: 'POST',
    body: { accountNumber: accountNumber.trim() },
    token: account.token,
  });
  return { account: await toAccount(response), accountNumber: response.accountNumber ?? '' };
}

// The videos site sends visitors here as /#access=<pass>; it's kept for this tab until they register.
const VIDEOS_PASS_KEY = 'quillwood-videos-pass';

/** Moves a pass from the address bar into this tab's storage and returns it. */
export function takeVideosPassFromUrl(): string {
  const match = window.location.hash.match(/^#access=([^&]+)/);
  if (!match) return '';
  const pass = decodeURIComponent(match[1]);
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
  try { sessionStorage.setItem(VIDEOS_PASS_KEY, pass); } catch { /* still usable for this page */ }
  return pass;
}

function passExpired(pass: string) {
  try {
    const payload = JSON.parse(atob(pass.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number(payload.exp) * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function readVideosPass(): string {
  let pass = '';
  try { pass = sessionStorage.getItem(VIDEOS_PASS_KEY) || ''; } catch { /* storage unavailable */ }
  return pass && !passExpired(pass) ? pass : '';
}

export function clearVideosPass() {
  try { sessionStorage.removeItem(VIDEOS_PASS_KEY); } catch { /* nothing stored */ }
}
