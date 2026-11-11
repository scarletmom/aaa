const VIDEO_URL = /\.(m3u8|mp4|webm|mkv|mov|mpd|m4v)(\?|#|$)/i;

function compileRegex(pattern, flags = "i") {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function urlParts(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }
  const file = safeDecode(parsed.pathname.split("/").pop() || "");
  const dot = file.lastIndexOf(".");
  return {
    url: parsed.toString(),
    origin: parsed.origin,
    host: parsed.host,
    hostname: parsed.hostname,
    path: parsed.pathname,
    query: parsed.search.replace(/^\?/, ""),
    params: Object.fromEntries(parsed.searchParams),
    file,
    name: dot > 0 ? file.slice(0, dot) : file,
    ext: dot > 0 ? file.slice(dot + 1) : "",
    dir: parsed.origin + parsed.pathname.slice(0, parsed.pathname.lastIndexOf("/") + 1),
  };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Returns capture groups (possibly empty) when the URL matches, null otherwise.
function matchUrl(matchType, matchValue, url) {
  const value = String(matchValue || "").trim();
  if (!matchType || matchType === "none" || !value || !url) return null;

  if (matchType === "regex") {
    const match = compileRegex(value)?.exec(url);
    return match ? match.slice(1).map((g) => (g == null ? "" : g)) : null;
  }
  if (matchType === "prefix") return url.startsWith(value) ? [] : null;

  const parts = urlParts(url);
  if (!parts) return null;
  const host = parts.hostname.toLowerCase();
  const hosts = value.toLowerCase().split(/[\s,]+/).filter(Boolean);
  return hosts.some((wanted) => host === wanted || host.endsWith(`.${wanted}`)) ? [] : null;
}

// URLs inside inline scripts are often JSON- or HTML-escaped: https:\/\/a.com\/v.mp4?x=1&y=2
function unescapePage(html) {
  return String(html)
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&quot;/gi, '"');
}

function absolute(candidate, base) {
  try {
    const resolved = new URL(String(candidate).trim(), base || undefined).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

// Absolute URLs anywhere in the text, plus relative ones in src/href/file/source attributes or keys.
function extractUrls(text, base) {
  const page = unescapePage(text);
  const found = [];
  for (const match of page.matchAll(/https?:\/\/[^\s"'<>`\\]+/gi)) found.push(match[0]);
  for (const match of page.matchAll(/\b(?:src|href|file|source|data-src)["']?\s*[:=]\s*["']([^"']+)["']/gi)) {
    found.push(match[1]);
  }
  return [...new Set(found.map((url) => absolute(url, base)).filter(Boolean))];
}

function setCookies(res) {
  const headers = res.headers;
  const list = headers.getSetCookie ? headers.getSetCookie() : [];
  return list.map((cookie) => cookie.split(";")[0].trim()).filter(Boolean);
}

function cookieHeader(...lists) {
  const jar = new Map();
  for (const cookie of lists.flat().filter(Boolean)) {
    for (const part of String(cookie).split(/;\s*/)) {
      const index = part.indexOf("=");
      if (index > 0) jar.set(part.slice(0, index).trim(), part.trim());
    }
  }
  return [...jar.values()].join("; ");
}

function kvToObject(list) {
  const out = {};
  for (const row of Array.isArray(list) ? list : []) {
    const key = String(row?.key ?? "").trim();
    if (key) out[key] = row.value == null ? "" : typeof row.value === "object" ? JSON.stringify(row.value) : String(row.value);
  }
  return out;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? `Request timed out after ${timeoutMs} ms` : err.cause?.message || err.message);
  } finally {
    clearTimeout(timer);
  }
}

// Walks a Location chain by hand so cookies and headers travel with every hop; never downloads the body.
async function resolveRedirects(url, { headers = {}, cookie = "", maxHops = 5, timeoutMs = 8000 } = {}) {
  let cookies = cookie ? [cookie] : [];
  let current = url;
  const hops = [];

  for (let hop = 0; hop <= maxHops; hop += 1) {
    const sent = { ...headers };
    const jar = cookieHeader(cookies);
    if (jar) sent.Cookie = jar;

    const res = await fetchWithTimeout(current, { method: "GET", headers: sent, redirect: "manual" }, timeoutMs);
    res.body?.cancel().catch(() => {});
    const location = res.headers.get("location");
    hops.push({ url: current, status: res.status, location: location || "" });

    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      cookies = [...cookies, ...setCookies(res)];
      continue;
    }
    if (!res.ok) throw new Error(`${current} answered HTTP ${res.status} instead of a redirect or the file`);
    return { url: current, status: res.status, hops };
  }
  throw new Error(`More than ${maxHops} redirects`);
}

module.exports = {
  VIDEO_URL,
  compileRegex,
  urlParts,
  matchUrl,
  unescapePage,
  absolute,
  extractUrls,
  setCookies,
  cookieHeader,
  kvToObject,
  fetchWithTimeout,
  resolveRedirects,
};
