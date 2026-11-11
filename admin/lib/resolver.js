const store = require("./store");
const { runWorkflow, inputSettings } = require("./engine");
const { matchUrl } = require("./helpers");

const MAX_CACHE_ENTRIES = 2000;
const cache = new Map();

function forgetCache(workflowId) {
  for (const key of cache.keys()) if (key.startsWith(`${workflowId}:`)) cache.delete(key);
}

async function run(workflow, input, mode) {
  const { cacheSeconds } = inputSettings(workflow);
  const key = `${workflow.id}:${JSON.stringify(input)}`;
  const hit = cache.get(key);
  if (cacheSeconds > 0 && hit && hit.expiresAt > Date.now()) return { ...hit.execution, cached: true };

  const execution = store.record(await runWorkflow(workflow, input, { mode }));
  if (cacheSeconds > 0 && execution.status === "success") {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(key, { execution, expiresAt: Date.now() + cacheSeconds * 1000 });
  }
  return execution;
}

// Runs the first active workflow whose Input node matches the URL.
// `failed` means the workflow errored and its Input node is not set to fall back to the original.
async function resolveUrl(url, input = { url }, mode = "resolve") {
  for (const workflow of store.list()) {
    if (!workflow.active) continue;
    const settings = inputSettings(workflow);
    if (!matchUrl(settings.matchType, settings.matchValue, url)) continue;

    const execution = await run(workflow, input, mode);
    const meta = { matched: true, workflow: workflow.name, workflowId: workflow.id, executionId: execution.id, durationMs: execution.durationMs };
    if (execution.status !== "success") {
      const error = execution.error?.message;
      console.error(`workflow "${workflow.name}" failed for ${url}: ${error}`);
      if (settings.onError === "original") return { ...meta, url, error, fallback: true };
      return { ...meta, failed: true, error, node: execution.error?.nodeName };
    }
    const response = execution.response;
    const result = response.mode === "redirect" ? response.url : response.body?.url ?? response.url;
    return { ...meta, url: result || url, data: response.body ?? null, cached: Boolean(execution.cached) };
  }
  return { matched: false, url };
}

module.exports = { run, forgetCache, resolveUrl };
