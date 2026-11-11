const PROBE_TIMEOUT_MS = 8000;
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const MAX_DURATION_SECONDS = 100 * 3600;

// Mirrors the player's own parsing: the stream is everything after url=, possibly unencoded.
function videoSource(realUrl) {
  const value = String(realUrl || "");
  const match = /[?&]url=(.*)$/.exec(value);
  if (!match) return value;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

function isHls(url) {
  return /^https?:\/\/[^?#]+\.m3u8(?:[?#]|$)/i.test(String(url || ""));
}

async function fetchPlaylist(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: "follow" });
  if (!res.ok) return "";
  const text = await res.text();
  return text.length > MAX_PLAYLIST_BYTES ? "" : text;
}

// Every rendition of a master playlist has the same length, so the first one is enough.
function firstVariant(playlist, baseUrl) {
  const lines = playlist.split(/\r?\n/).map((line) => line.trim());
  const index = lines.findIndex((line) => line.startsWith("#EXT-X-STREAM-INF"));
  if (index === -1) return "";
  const uri = lines.slice(index + 1).find((line) => line && !line.startsWith("#"));
  return uri ? new URL(uri, baseUrl).toString() : "";
}

function sumSegments(playlist) {
  let total = 0;
  for (const match of playlist.matchAll(/^#EXTINF:\s*([\d.]+)/gm)) total += Number(match[1]) || 0;
  return total;
}

// Best effort: any network or parse failure just means "length unknown".
async function probeDuration(realUrl) {
  const source = videoSource(realUrl);
  if (!isHls(source)) return null;
  try {
    let playlist = await fetchPlaylist(source);
    const variant = firstVariant(playlist, source);
    if (variant) playlist = await fetchPlaylist(variant);
    const seconds = Math.round(sumSegments(playlist));
    return seconds > 0 && seconds <= MAX_DURATION_SECONDS ? seconds : null;
  } catch (err) {
    console.error(`duration probe failed for ${source}: ${err.message}`);
    return null;
  }
}

// Accepts "95", "1:35" or "1:02:03". Returns null for blank, NaN for unparseable.
function parseDuration(text) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value)) return NaN;
  const parts = value.split(":").map(Number);
  if (parts.slice(1).some((part) => part > 59)) return NaN;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 && seconds <= MAX_DURATION_SECONDS ? seconds : NaN;
}

module.exports = { probeDuration, parseDuration };
