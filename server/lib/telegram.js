const crypto = require("node:crypto");
const { config } = require("./config");
const tokens = require("./tokens");

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const PROBE_TTL_MS = 10 * 60 * 1000;
const SCRIPT_LOADED = /\.(m3u8|mpd)(\?|#|$)/i;

const enabled = () => Boolean(config.telegramAppUrl);

function appLink(tag) {
  const url = new URL(config.telegramAppUrl);
  url.searchParams.set("startapp", tokens.signApp(tag));
  return url.href;
}

// HLS and DASH are fetched by the player's JavaScript, so their host must allow the news site (CORS).
// MP4 and other files play through <video> directly and don't need it.
const probes = new Map();

async function blocksNewsSite(streamUrl) {
  if (!SCRIPT_LOADED.test(streamUrl)) return false;
  const newsOrigin = new URL(config.newsSite).origin;
  const host = new URL(streamUrl).host;
  const hit = probes.get(host);
  if (hit && hit.expiresAt > Date.now()) return hit.blocked;

  let blocked = false;
  try {
    const res = await fetch(streamUrl, { headers: { Origin: newsOrigin, Range: "bytes=0-0" }, signal: AbortSignal.timeout(5000) });
    res.body?.cancel().catch(() => {});
    const allowed = res.headers.get("access-control-allow-origin");
    blocked = res.ok || res.status === 206 ? allowed !== "*" && allowed !== newsOrigin : false;
  } catch {
    // Unreachable from here says nothing about CORS; the player's own error fallback covers it.
    return false;
  }
  if (probes.size > 1000) probes.clear();
  probes.set(host, { blocked, expiresAt: Date.now() + PROBE_TTL_MS });
  return blocked;
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function validInitData(initData) {
  if (!config.telegramBotToken) return true;
  if (typeof initData !== "string" || !initData) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  params.delete("hash");
  const checkString = [...params.entries()].map(([key, value]) => `${key}=${value}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(config.telegramBotToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  if (hash.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return false;
  return Date.now() / 1000 - Number(params.get("auth_date")) < INIT_DATA_MAX_AGE_SECONDS;
}

module.exports = { enabled, appLink, blocksNewsSite, validInitData };
