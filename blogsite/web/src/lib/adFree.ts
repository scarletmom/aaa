'use client';

import { useEffect, useState } from 'react';
import site from '@/data/site.json';
import type { Session } from './session';

// The server's public key, built into the bundle: a key fetched at runtime could be swapped by the viewer.
function configuredKey(): JsonWebKey | null {
  try {
    const raw = process.env.NEXT_PUBLIC_AD_FREE_KEY;
    const key = raw ? JSON.parse(raw) : (site as { adFreeKey?: JsonWebKey | null }).adFreeKey;
    return key?.kty === 'EC' && key.crv === 'P-256' && key.x && key.y ? key : null;
  } catch {
    return null;
  }
}

let publicKey: Promise<CryptoKey | null> | null = null;

function importKey() {
  const jwk = configuredKey();
  publicKey ||= jwk
    ? crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']).catch(() => null)
    : Promise.resolve(null);
  return publicKey;
}

const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

/** Whether `pass` is a current ad-free pass the server signed for `accountId`. Anything else means ads. */
async function verifyPass(pass: string, accountId: string): Promise<boolean> {
  try {
    const key = await importKey();
    const [header, payload, signature] = pass.split('.');
    if (!key || !header || !payload || !signature) return false;
    if (JSON.parse(new TextDecoder().decode(fromBase64Url(header))).alg !== 'ES256') return false;
    const signed = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, fromBase64Url(signature), new TextEncoder().encode(`${header}.${payload}`));
    if (!signed) return false;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return claims.aud === 'ad-free' && claims.sub === accountId && Number(claims.exp) * 1000 > Date.now();
  } catch {
    return false;
  }
}

const checked = new Map<string, Promise<boolean>>();

function checkPass(pass: string, accountId: string) {
  const key = `${accountId}\n${pass}`;
  let result = checked.get(key);
  if (!result) {
    result = verifyPass(pass, accountId);
    checked.set(key, result);
  }
  return result;
}

/** True once the session's ad-free pass checks out, false when it has none or it doesn't, null while checking. */
export function useAdFree(session: Session | null): boolean | null {
  const pass = session?.adFree ?? null;
  const accountId = session?.id ?? '';
  const [result, setResult] = useState<{ pass: string; accountId: string; valid: boolean } | null>(null);

  useEffect(() => {
    if (!pass) return;
    let cancelled = false;
    checkPass(pass, accountId).then((valid) => !cancelled && setResult({ pass, accountId, valid }));
    return () => { cancelled = true; };
  }, [pass, accountId]);

  if (!pass) return false;
  return result?.pass === pass && result.accountId === accountId ? result.valid : null;
}
