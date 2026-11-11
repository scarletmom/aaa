const { config } = require("./config");

const PAGES_TTL_MS = 10 * 60 * 1000;
const EXCLUDED = /^\/?player\//;

let cached = { slugs: [], loadedAt: 0 };

async function loadSlugs() {
  const res = await fetch(new URL("pages.json", config.newsSite), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`pages.json answered HTTP ${res.status}`);
  const pages = await res.json();
  return (Array.isArray(pages) ? pages : [])
    .map((page) => (typeof page?.slug === "string" ? page.slug.trim() : ""))
    .filter((slug) => slug.startsWith("/") && !EXCLUDED.test(slug));
}

async function pageSlugs() {
  if (Date.now() - cached.loadedAt < PAGES_TTL_MS && cached.slugs.length) return cached.slugs;
  try {
    const slugs = await loadSlugs();
    if (slugs.length) cached = { slugs, loadedAt: Date.now() };
  } catch (err) {
    console.error(`news pages.json: ${err.message}`);
  }
  return cached.slugs.length ? cached.slugs : ["/"];
}

// A random news page with the gate token appended to its query string.
async function gatePageUrl(token) {
  const slugs = await pageSlugs();
  const slug = slugs[Math.floor(Math.random() * slugs.length)];
  const url = new URL(slug.replace(/^\//, ""), config.newsSite);
  url.searchParams.set("token", token);
  return url.href;
}

// The player reads everything after "endpoint=" as the endpoint, so it must be the last parameter.
function playerUrl(endpoint) {
  return `${new URL("player/", config.newsSite).href}?endpoint=${encodeURIComponent(endpoint)}`;
}

module.exports = { gatePageUrl, playerUrl };
