const vm = require("node:vm");
const crypto = require("node:crypto");
const { NODE_TYPES } = require("./nodes");
const { urlParts } = require("./helpers");

const EXPRESSION = /\{\{([\s\S]+?)\}\}/g;
const EXPRESSION_TIMEOUT_MS = 250;

class NodeError extends Error {
  constructor(node, cause) {
    super(cause.message);
    this.nodeId = node.id;
    this.nodeName = node.name;
  }
}

function toPlain(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    throw new Error(`Output must be JSON-serializable: ${err.message}`);
  }
}

function stringify(value) {
  if (value == null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function evaluate(code, context) {
  try {
    return vm.runInContext(`(${code})`, context, { timeout: EXPRESSION_TIMEOUT_MS });
  } catch (err) {
    throw new Error(`Expression {{${code}}} failed: ${err.message}`);
  }
}

// A string that is exactly one {{ }} keeps the expression's type; mixed text is interpolated.
function resolveValue(value, context) {
  if (typeof value === "string") {
    if (!value.includes("{{")) return value;
    const trimmed = value.trim();
    if (trimmed.startsWith("{{") && trimmed.endsWith("}}") && trimmed.indexOf("{{", 2) === -1) {
      return evaluate(trimmed.slice(2, -2), context);
    }
    return value.replace(EXPRESSION, (_, code) => stringify(evaluate(code, context)));
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, context)]));
  }
  return value;
}

function resolveParams(type, raw, scope) {
  const params = {};
  let context = null;
  for (const def of type.params) {
    const value = raw?.[def.name] ?? def.default;
    if (type.noExpressions || def.type === "code" || def.type === "json") {
      params[def.name] = value;
      continue;
    }
    context ||= vm.createContext({ ...scope });
    try {
      params[def.name] = resolveValue(value, context);
    } catch (err) {
      throw new Error(`${def.label}: ${err.message}`);
    }
  }
  return params;
}

// Each node has at most one parent, so a BFS from the input node is already a valid run order.
function plan(workflow) {
  const nodes = new Map((workflow.nodes || []).map((node) => [node.id, node]));
  const trigger = workflow.nodes?.find((node) => node.type === "input");
  if (!trigger) throw new Error("Workflow has no Input node");

  const parent = new Map();
  const children = new Map();
  for (const { from, to, output } of workflow.connections || []) {
    if (!nodes.has(from) || !nodes.has(to) || nodes.get(to).type === "input" || parent.has(to)) continue;
    parent.set(to, { from, output: Number(output) || 0 });
    if (!children.has(from)) children.set(from, []);
    children.get(from).push(to);
  }

  const order = [];
  const seen = new Set([trigger.id]);
  const queue = [trigger.id];
  while (queue.length) {
    const id = queue.shift();
    order.push(nodes.get(id));
    for (const child of children.get(id) || []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return { order, parent, trigger };
}

const flatten = (ports) => (ports || []).flat();

// $node["Name"].json pairs with the current item index when that step produced one, else its first item.
function scopeBuilder({ items, triggerOutput, byName, execution }) {
  return (item, index) => ({
    $json: item ?? {},
    $itemIndex: index,
    $items: items,
    $input: triggerOutput,
    $node: Object.fromEntries([...byName].map(([name, all]) => [name, { json: all[index] ?? all[0], items: all }])),
    $now: new Date().toISOString(),
    $execution: { id: execution.id, mode: execution.mode },
    $enc: encodeURIComponent,
    $dec: decodeURIComponent,
    $url: urlParts,
  });
}

// Runs one step over its incoming items and returns its output as ports: an array of item lists.
async function runStep(node, type, items, record, makeScope) {
  const resolveFor = (item, index) => resolveParams(type, node.params, makeScope(item, index));

  if (type.kind === "batch") {
    const result = await type.executeBatch({ items, resolveFor, scopeFor: makeScope, logs: record.logs });
    return [result.map(toPlain)];
  }

  const ports = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const scope = makeScope(item, index);
    const params = resolveParams(type, node.params, scope);
    const result = await type.execute(params, { json: item, scope, logs: record.logs, index });
    if (type.kind === "route") {
      for (const port of result) (ports[port] ||= []).push(item);
    } else if (type.kind === "expand") {
      (ports[0] ||= []).push(...result.map(toPlain));
    } else {
      (ports[0] ||= []).push(toPlain(result));
    }
  }
  for (let i = 0; i < Math.max(ports.length, 1); i += 1) ports[i] ||= [];
  return ports;
}

async function runWorkflow(workflow, input, { mode = "manual" } = {}) {
  const started = Date.now();
  const execution = {
    id: crypto.randomUUID(),
    workflowId: workflow.id || null,
    workflowName: workflow.name || "",
    mode,
    startedAt: new Date(started).toISOString(),
    status: "running",
    input,
    nodes: {},
    order: [],
    response: null,
    error: null,
  };

  try {
    const { order, parent } = plan(workflow);
    const outputs = new Map();
    const byName = new Map();
    let triggerOutput = {};
    let last = [];

    for (const node of order) {
      const type = NODE_TYPES[node.type];
      if (!type) throw new NodeError(node, new Error(`Unknown node type "${node.type}"`));

      const link = parent.get(node.id);
      const items = node.type === "input" ? [input] : link ? outputs.get(link.from)?.[link.output] || [] : [];
      if (!items.length) {
        execution.nodes[node.id] = { status: "skipped", input: [], output: [], error: null, logs: [], durationMs: 0 };
        outputs.set(node.id, []);
        continue;
      }

      const record = { status: "running", input: items, output: [], error: null, logs: [], durationMs: 0 };
      execution.nodes[node.id] = record;
      execution.order.push(node.id);

      const makeScope = scopeBuilder({ items, triggerOutput, byName, execution });

      const nodeStart = Date.now();
      try {
        const ports = await runStep(node, type, items, record, makeScope);
        record.output = ports;
        record.status = "success";
        outputs.set(node.id, ports);
        byName.set(node.name, flatten(ports));
        last = flatten(ports);
        if (node.type === "input") triggerOutput = ports[0][0];
        if (node.type === "respond" && !execution.response) execution.response = ports[0][0];
      } catch (err) {
        record.status = "error";
        record.error = err.message;
        if (err.output) record.output = [[toPlain(err.output)]];
        throw new NodeError(node, err);
      } finally {
        record.durationMs = Date.now() - nodeStart;
      }
    }

    const body = last.length === 1 ? last[0] : last;
    execution.response ||= { mode: "json", status: 200, url: last[0]?.url, body };
    execution.status = "success";
  } catch (err) {
    execution.status = "error";
    execution.error = { message: err.message, nodeId: err.nodeId || null, nodeName: err.nodeName || null };
  }

  execution.durationMs = Date.now() - started;
  return execution;
}

class StepUnavailable extends Error {}

// Re-runs one step on the items its parent produced in `base` (an earlier run of this workflow),
// and returns a copy of that run with only this step's record replaced. The Input step runs on `input`.
async function runSingleStep(workflow, nodeId, base, input) {
  const started = Date.now();
  const { order, parent, trigger } = plan(workflow);
  const position = order.findIndex((node) => node.id === nodeId);
  if (position === -1) throw new StepUnavailable("This step isn't connected to the Input step, so nothing can reach it.");
  const node = order[position];
  const type = NODE_TYPES[node.type];
  if (!type) throw new StepUnavailable(`Unknown node type "${node.type}"`);

  const isTrigger = node.type === "input";
  if (!isTrigger && !base) throw new StepUnavailable("Run the workflow first, so this step has input to work on.");

  const link = parent.get(node.id);
  const items = isTrigger ? [input] : base.nodes[link.from]?.output?.[link.output] || [];
  if (!items.length) throw new StepUnavailable("No items reached this step in the last run. Run the steps before it first.");

  const execution = {
    ...(base || {}),
    id: crypto.randomUUID(),
    workflowId: workflow.id || null,
    workflowName: workflow.name || "",
    mode: "step",
    step: node.id,
    startedAt: new Date(started).toISOString(),
    input: isTrigger ? input : base.input,
    nodes: { ...(base?.nodes || {}) },
    order: base?.order?.includes(node.id) ? [...base.order] : [...(base?.order || []), node.id],
    response: base?.response ?? null,
    error: null,
  };

  const byName = new Map();
  for (const earlier of order.slice(0, position)) {
    const output = execution.nodes[earlier.id]?.output;
    if (output?.length) byName.set(earlier.name, flatten(output));
  }
  const triggerOutput = isTrigger ? input : execution.nodes[trigger.id]?.output?.[0]?.[0] ?? {};

  const record = { status: "running", input: items, output: [], error: null, logs: [], durationMs: 0 };
  execution.nodes[node.id] = record;
  try {
    const ports = await runStep(node, type, items, record, scopeBuilder({ items, triggerOutput, byName, execution }));
    record.output = ports;
    record.status = "success";
    if (node.type === "respond") execution.response = ports[0][0];
  } catch (err) {
    record.status = "error";
    record.error = err.message;
    if (err.output) record.output = [[toPlain(err.output)]];
  } finally {
    record.durationMs = Date.now() - started;
  }

  const failedId = execution.order.find((id) => execution.nodes[id]?.status === "error");
  const failed = order.find((candidate) => candidate.id === failedId);
  execution.status = failed ? "error" : "success";
  execution.error = failed ? { message: execution.nodes[failed.id].error, nodeId: failed.id, nodeName: failed.name } : null;
  execution.durationMs = record.durationMs;
  return execution;
}

function inputNode(workflow) {
  return (workflow.nodes || []).find((node) => node.type === "input");
}

function inputSettings(workflow) {
  const params = inputNode(workflow)?.params || {};
  return {
    matchType: params.matchType || "none",
    matchValue: params.matchValue || "",
    cacheSeconds: Number(params.cacheSeconds) || 0,
    onError: params.onError || "error",
    urlField: params.urlField || "url",
  };
}

module.exports = { runWorkflow, runSingleStep, StepUnavailable, inputNode, inputSettings, resolveValue };
