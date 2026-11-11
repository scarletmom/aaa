export const SIGNED_OUT_EVENT = "linkproxy:signed-out";

export async function api(path, { body, ...options } = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, code: data.code, errors: data.errors });
  return data;
}

let typesPromise;
export function loadTypes() {
  typesPromise ||= api("/api/node-types").catch((err) => {
    typesPromise = null;
    throw err;
  });
  return typesPromise;
}

export const signOut = () =>
  api("/api/auth/logout", { method: "POST" }).finally(() => window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail: { manual: true } })));
