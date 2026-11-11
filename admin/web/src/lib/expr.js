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

// Items that reach `nodeId`: what it actually received, or what its parent sent down the connected port.
export function incomingItems(exec, edges, nodeId) {
  const record = exec?.nodes?.[nodeId];
  if (record?.input?.length) return record.input;
  const edge = edges.find((e) => e.target === nodeId);
  if (!edge) return [];
  const port = Number(String(edge.sourceHandle || "").replace("out-", "")) || 0;
  return exec?.nodes?.[edge.source]?.output?.[port] || [];
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
