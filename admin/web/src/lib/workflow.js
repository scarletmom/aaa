import { api, loadTypes } from "./api.js";
import { ArrowRightLeft, Braces, Code, FilePlus2, Film, ImageDown, Filter, Globe, Group, HardDriveDownload, LogIn, LogOut, ScanSearch, Split, Ungroup, Workflow } from "lucide-react";

export const NODE_ICONS = {
  input: LogIn,
  http: Globe,
  extract: ScanSearch,
  code: Code,
  set: Braces,
  redirects: ArrowRightLeft,
  split: Ungroup,
  filter: Filter,
  switch: Split,
  aggregate: Group,
  subworkflow: Workflow,
  save: HardDriveDownload,
  frames: Film,
  resize: ImageDown,
  post: FilePlus2,
  respond: LogOut,
};

// Labels for steps with more than one output, or null for a single output.
export function outputPorts(data) {
  if (data.type === "switch") {
    const rules = (data.params?.rules || []).map((rule, i) => String(rule.label || "").trim() || `Rule ${i + 1}`);
    return data.params?.fallback === "output" ? [...rules, "Fallback"] : rules;
  }
  if (data.type === "filter" && data.params?.discarded === "output") return ["Kept", "Discarded"];
  return null;
}

export const portCount = (data) => outputPorts(data)?.length ?? 1;
export const portOf = (handle) => Number(String(handle || "").replace("out-", "")) || 0;

export const iconFor = (type) => NODE_ICONS[type] || Workflow;

export const GAP_X = 320;

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultParams(types, type) {
  return Object.fromEntries(types[type].params.map((def) => [def.name, structuredClone(def.default)]));
}

export function paramValue(params, def) {
  const value = params?.[def.name];
  return value === undefined ? structuredClone(def.default) : value;
}

export function uniqueName(nodes, base, exceptId) {
  const taken = new Set(nodes.filter((n) => n.id !== exceptId).map((n) => n.data.name));
  if (!taken.has(base)) return base;
  const stem = base.replace(/\s+\d+$/, "");
  let n = 2;
  while (taken.has(`${stem} ${n}`)) n += 1;
  return `${stem} ${n}`;
}

// "{method} {url}" → "GET {{ $json.url }}", skipping empty and "none" values.
export function subtitle(type, params) {
  if (!type?.subtitle) return "";
  return type.subtitle
    .replace(/\{(\w+)\}/g, (_, name) => {
      const def = type.params.find((p) => p.name === name);
      const value = def ? paramValue(params, def) : "";
      if (Array.isArray(value) && def.unit) return `${value.length} ${def.unit}${value.length === 1 ? "" : "s"}`;
      if (Array.isArray(value)) return value.map((row) => row.key).filter(Boolean).join(", ");
      const option = def?.options?.find((o) => typeof o === "object" && o.value === value);
      if (option) return option.label;
      return value === "none" || value == null ? "" : String(value);
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function toFlow(workflow) {
  const nodes = workflow.nodes.map((node) => ({
    id: node.id,
    type: "step",
    position: { x: node.position[0], y: node.position[1] },
    deletable: node.type !== "input",
    data: { type: node.type, name: node.name, params: node.params || {} },
  }));
  const edges = workflow.connections.map(({ from, to, output }) => wire(from, to, output));
  return { nodes, edges };
}

export function fromFlow(meta, nodes, edges) {
  return {
    ...meta,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.type,
      name: node.data.name,
      position: [Math.round(node.position.x), Math.round(node.position.y)],
      params: node.data.params,
    })),
    connections: edges.map((edge) => {
      const output = portOf(edge.sourceHandle);
      return output ? { from: edge.source, to: edge.target, output } : { from: edge.source, to: edge.target };
    }),
  };
}

export function wire(source, target, output = 0) {
  const port = Number(output) || 0;
  return { id: `${source}:${port}->${target}`, source, target, sourceHandle: `out-${port}`, type: "wire" };
}

export function parentOf(edges, id) {
  return edges.find((edge) => edge.target === id)?.source ?? null;
}

// Whether a step can run on its own: it needs its parent's output from the last run.
export function stepReadiness({ exec, nodes, edges, nodeId }) {
  const node = nodes.find((n) => n.id === nodeId);
  if (node?.data.type === "input") return { ready: true };
  const edge = edges.find((e) => e.target === nodeId);
  if (!edge) return { ready: false, reason: "Connect a step into this one first" };
  if (!exec) return { ready: false, reason: "Run the workflow once so this step has input" };
  const parent = exec.nodes?.[edge.source];
  const parentName = nodes.find((n) => n.id === edge.source)?.data.name || "The step before";
  if (!parent || parent.status === "skipped") return { ready: false, reason: `“${parentName}” didn't run last time. Run the workflow first` };
  if (parent.status !== "success") return { ready: false, reason: `“${parentName}” failed last time. Run it first` };
  if (!parent.output?.[portOf(edge.sourceHandle)]?.length) return { ready: false, reason: `“${parentName}” sent no items to this step last time` };
  return { ready: true };
}

export function isAncestor(edges, candidate, id) {
  for (let cur = parentOf(edges, id); cur; cur = parentOf(edges, cur)) if (cur === candidate) return true;
  return false;
}

// Renaming a node rewrites every $node["Old"] reference so expressions keep working.
export function renameRefs(nodes, oldName, newName) {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ref = new RegExp(`\\$node\\[(["'])${escaped}\\1\\]`, "g");
  const rewrite = (value) => {
    if (typeof value === "string") return value.replace(ref, (_, q) => `$node[${q}${newName}${q}]`);
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return value;
  };
  return nodes.map((node) => ({ ...node, data: { ...node.data, params: rewrite(node.data.params) } }));
}

export function relativeTime(iso) {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const workflowPath = (id) => `/workflows/${id}`;

export async function createWorkflow(name = "New workflow") {
  const types = await loadTypes();
  const http = newId();
  return api("/api/workflows", {
    method: "POST",
    body: {
      name,
      active: false,
      nodes: [
        { id: "in", type: "input", name: "Input", position: [0, 0], params: defaultParams(types, "input") },
        { id: http, type: "http", name: "HTTP Request", position: [300, 0], params: defaultParams(types, "http") },
        { id: "out", type: "respond", name: "Output", position: [600, 0], params: defaultParams(types, "respond") },
      ],
      connections: [
        { from: "in", to: http },
        { from: http, to: "out" },
      ],
    },
  });
}

export const USAGES = [
  { value: "delivery", label: "Delivery", hint: "Answers matching URLs on /resolve, Visit and the videos site, while Active" },
  { value: "pipeline", label: "Pipeline", hint: "Can be run by Run Workflow steps in other workflows" },
];

export const usageOf = (workflow) => (workflow?.usage?.length ? workflow.usage : ["delivery"]);

// Mirrors the server's check: the videos server can't run pipeline-only steps or $env.
export function deliveryBlockers(nodes, types) {
  return nodes.flatMap((node) => {
    if (types[node.data.type]?.pipelineOnly) return [`${node.data.name} (${types[node.data.type].label})`];
    if (node.data.type === "http" && node.data.params?.repeat) return [`${node.data.name} (Repeat until)`];
    if (JSON.stringify(node.data.params || {}).includes("$env")) return [`${node.data.name} ($env)`];
    return [];
  });
}
