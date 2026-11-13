// Client-side preview of {{ }} expressions; mirrors lib/engine.js closely enough for live hints.

function urlParts(url) {
  try {
    const u = new URL(String(url));
    const file = decodeURIComponent(u.pathname.split("/").pop() || "");
    const dot = file.lastIndexOf(".");
    return {
      url: u.toString(),
      origin: u.origin,
      host: u.host,
      hostname: u.hostname,
      path: u.pathname,
      query: u.search.slice(1),
      params: Object.fromEntries(u.searchParams),
      file,
      name: dot > 0 ? file.slice(0, dot) : file,
      ext: dot > 0 ? file.slice(dot + 1) : "",
      dir: u.origin + u.pathname.slice(0, u.pathname.lastIndexOf("/") + 1),
    };
  } catch {
    return null;
  }
}

// Items that reach `nodeId`: what its parent sends down the connected port now, so re-running an earlier
// step shows up here at once. Falls back to what this step received when the parent has no output.
export function incomingItems(exec, edges, nodeId) {
  const edge = edges.find((e) => e.target === nodeId);
  const port = Number(String(edge?.sourceHandle || "").replace("out-", "")) || 0;
  const fromParent = edge ? exec?.nodes?.[edge.source]?.output?.[port] : null;
  if (fromParent?.length) return fromParent;
  return exec?.nodes?.[nodeId]?.input || [];
}

// True when this step's last output was made from different input than its parent now sends.
export function isStale(exec, edges, nodeId) {
  const record = exec?.nodes?.[nodeId];
  if (!record?.input?.length || record.status === "skipped") return false;
  return JSON.stringify(record.input) !== JSON.stringify(incomingItems(exec, edges, nodeId));
}

export function previewScope({ exec, nodes, edges, nodeId }) {
  if (!exec) return null;
  const $node = {};
  for (const n of nodes) {
    const all = exec.nodes[n.id]?.output?.flat() || [];
    if (all.length) $node[n.data.name] = { json: all[0], items: all };
  }
  const node = nodes.find((n) => n.id === nodeId);
  const items = incomingItems(exec, edges, nodeId);
  if (!items.length && node?.data.type !== "input") return null;
  const trigger = nodes.find((n) => n.data.type === "input");
  return {
    $json: items[0] ?? {},
    $items: items,
    $itemIndex: 0,
    $input: exec.nodes[trigger?.id]?.output?.[0]?.[0] ?? {},
    $node,
    $now: new Date().toISOString(),
    $execution: { id: exec.id, mode: exec.mode },
    $response: null,
    $attempt: 1,
    $enc: encodeURIComponent,
    $dec: decodeURIComponent,
    $url: urlParts,
  };
}

function evaluate(code, scope) {
  const keys = Object.keys(scope);
  return new Function(...keys, `"use strict"; return (${code});`)(...keys.map((k) => scope[k]));
}

export function resolvePreview(value, scope) {
  const text = String(value);
  const trimmed = text.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}") && trimmed.indexOf("{{", 2) === -1) {
    return evaluate(trimmed.slice(2, -2), scope);
  }
  return text.replace(/\{\{([\s\S]+?)\}\}/g, (_, code) => {
    const out = evaluate(code, scope);
    return out == null ? "" : typeof out === "object" ? JSON.stringify(out) : String(out);
  });
}

export function hasExpression(value) {
  return typeof value === "string" && value.includes("{{");
}
