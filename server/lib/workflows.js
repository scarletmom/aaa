const { getPool } = require("./db");
const { runWorkflow, inputSettings } = require("./engine/engine");
const { matchUrl } = require("./engine/helpers");

const LIST_TTL_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 2000;

let cachedList = null;
const results = new Map();

function toWorkflow(row) {
  let definition = {};
  try {
    definition = JSON.parse(row.definition);
  } catch {
    console.error(`workflow ${row.id} has an unreadable definition`);
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: Boolean(row.is_active),
    // Studio's "Use for" setting; workflows saved before it existed are delivery workflows.
    usage: Array.isArray(definition.usage) && definition.usage.length ? definition.usage : ["delivery"],
    nodes: Array.isArray(definition.nodes) ? definition.nodes : [],
    connections: Array.isArray(definition.connections) ? definition.connections : [],
    updatedAt: row.updated_at,
  };
}

// Same order linkproxy resolves in (by name), so both pick the same workflow for a URL.
async function activeWorkflows() {
  if (cachedList && Date.now() - cachedList.loadedAt < LIST_TTL_MS) return cachedList.workflows;
  try {
    const [rows] = await getPool().query(
      "SELECT id, name, slug, is_active, definition, updated_at FROM workflows WHERE is_active = 1 ORDER BY name ASC"
    );
    cachedList = { workflows: rows.map(toWorkflow), loadedAt: Date.now() };
  } catch (err) {
    if (err.code !== "ER_NO_SUCH_TABLE") throw err;
    cachedList = { workflows: [], loadedAt: Date.now() };
  }
  return cachedList.workflows;
}

// Cached per workflow version, so an edit in linkproxy is never answered from an old run.
async function run(workflow, input) {
  const { cacheSeconds } = inputSettings(workflow);
  const key = `${workflow.id}:${new Date(workflow.updatedAt).getTime()}:${JSON.stringify(input)}`;
  const hit = results.get(key);
  if (cacheSeconds > 0 && hit && hit.expiresAt > Date.now()) return hit.execution;

  const execution = await runWorkflow(workflow, input, { mode: "server" });
  if (cacheSeconds > 0 && execution.status === "success") {
    if (results.size >= MAX_CACHE_ENTRIES) results.clear();
    results.set(key, { execution, expiresAt: Date.now() + cacheSeconds * 1000 });
  }
  return execution;
}

// Mirrors linkproxy's /resolve: the first active workflow whose Input node matches the URL.
async function resolveUrl(url) {
  for (const workflow of await activeWorkflows()) {
    if (!workflow.usage.includes("delivery")) continue;
    const settings = inputSettings(workflow);
    if (!matchUrl(settings.matchType, settings.matchValue, url)) continue;

    const execution = await run(workflow, { url });
    if (execution.status !== "success") {
      const message = execution.error?.message;
      console.error(`workflow "${workflow.name}" failed for ${url}: ${message}`);
      if (settings.onError === "original") return url;
      throw new Error(`Workflow "${workflow.name}" failed: ${message}`);
    }
    const response = execution.response;
    const result = response.mode === "redirect" ? response.url : response.body?.url ?? response.url;
    return typeof result === "string" && result ? result : url;
  }
  return url;
}

// Old ad-site links: "/player/?url=<stream>" carries the stream, "/embed/?url=<page>" an iframe page.
function innerUrl(target) {
  const match = /[?&]url=(.*)$/.exec(target);
  if (!match) return null;
  let inner = match[1];
  try {
    inner = decodeURIComponent(inner);
  } catch {}
  inner = inner.trim();
  return /^https?:\/\//i.test(inner) ? inner : null;
}

function isEmbedLink(target) {
  try {
    return new URL(target).pathname.startsWith("/embed/");
  } catch {
    return false;
  }
}

// What the news player needs for a post: a stream to play, or a page to show in an iframe.
async function playable(realUrl) {
  if (isEmbedLink(realUrl)) return { embed: innerUrl(realUrl) || realUrl };
  const stream = innerUrl(realUrl) || realUrl;
  return { source: await resolveUrl(stream) };
}

module.exports = { playable, resolveUrl };
