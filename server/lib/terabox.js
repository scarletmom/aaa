const crypto = require("node:crypto");
const { config } = require("./config");
const { qualitiesOf } = require("./engine/helpers");

// Terabox serves the same share links from many mirror domains.
const HOSTS = [
  "terabox.com", "terabox.app", "terabox.fun", "terabox.club", "teraboxapp.com", "teraboxlink.com", "teraboxshare.com",
  "1024tera.com", "1024terabox.com", "terasharelink.com", "terafileshare.com", "freeterabox.com",
  "4funbox.com", "4funbox.co", "mirrobox.com", "nephobox.com", "momerybox.com", "tibibox.com", "gibibox.com",
];
// The workflow polls the stream API for up to a minute before it answers.
const RESOLVE_TIMEOUT_MS = 90 * 1000;
// Stream links carry their own short-lived tokens, so a resolved video is only kept long enough to start playing.
const KEEP_MS = 15 * 60 * 1000;
const MAX_KEPT = 1000;
const MAX_COOKIES = 20;
const MAX_COOKIE_LENGTH = 4000;
const VIDEO_EXTENSION = /\.(mp4|mkv|mov|avi|webm|m4v|ts|flv|wmv|3gp)$/i;

const kept = new Map();

/** The stream service refused because its usage limit is used up; it says when to try again. */
class TeraboxBusyError extends Error {}

const enabled = () => Boolean(config.adminUrl);

const isTeraboxHost = (hostname) => {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
};

/** The share link as https, or null when it isn't a Terabox share link. */
function shareLink(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 2000) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!isTeraboxHost(url.hostname)) return null;
  if (!url.searchParams.get("surl") && !/^\/s\/1[\w-]+/.test(url.pathname)) return null;
  url.protocol = "https:";
  return url.href;
}

/** The cookie strings the visitor's browser fetched, or null when they're missing or malformed. */
function cookieList(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_COOKIES) return null;
  const cookies = value.filter((item) => typeof item === "string" && item.trim() && item.length <= MAX_COOKIE_LENGTH);
  return cookies.length === value.length ? cookies : null;
}

const heightOf = (quality) => Number(/(\d{3,4})\s*p/i.exec(quality.label || quality.url)?.[1]) || 0;
const httpUrl = (value) => (typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "");
const titleOf = (value) => (typeof value === "string" ? value.trim().replace(VIDEO_EXTENSION, "").slice(0, 200) : "");

/** Runs the admin's Terabox workflow: { title, poster, qualities } with the best quality first. */
async function resolve(url, data) {
  const res = await fetch(new URL("terabox", config.adminUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.adminApiToken ? { Authorization: `Bearer ${config.adminApiToken}` } : {}) },
    body: JSON.stringify({ url, data }),
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body.error ? `${body.error}${body.node ? ` (at ${body.node})` : ""}` : `admin answered ${res.status}`;
    throw /\bHTTP 429\b|usage_limit/.test(message) ? new TeraboxBusyError(message) : new Error(message);
  }
  const qualities = qualitiesOf(body.qualities).sort((a, b) => heightOf(b) - heightOf(a));
  if (!qualities.length) throw new Error("the workflow returned no qualities");
  return { title: titleOf(body.title) || "Terabox video", poster: httpUrl(body.thumbnail), qualities };
}

/** Keeps a resolved video under an unguessable id for the player to fetch. */
function keep(video) {
  const now = Date.now();
  if (kept.size >= MAX_KEPT) for (const [id, item] of kept) if (item.expiresAt <= now) kept.delete(id);
  if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value);
  const id = crypto.randomBytes(18).toString("base64url");
  kept.set(id, { video, expiresAt: now + KEEP_MS });
  return id;
}

function find(id) {
  const item = typeof id === "string" ? kept.get(id) : undefined;
  if (!item) return null;
  if (item.expiresAt > Date.now()) return item.video;
  kept.delete(id);
  return null;
}

module.exports = { TeraboxBusyError, enabled, shareLink, cookieList, resolve, keep, find };
