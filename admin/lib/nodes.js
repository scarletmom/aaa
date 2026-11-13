const vm = require("node:vm");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const helpers = require("./helpers");
const conditions = require("./conditions");
const { loadFile, fileFromResponse, isBinaryType, baseMime, mimeFromName, nameFromUrl, EXT_BY_MIME } = require("./files");
const storage = require("./storage");
const ffmpeg = require("./ffmpeg");

const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function multipartBody(rows, timeoutMs) {
  const form = new FormData();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row?.key ?? "").trim();
    if (!name) continue;
    if (row.kind === "file") {
      const file = await loadFile(row.value, { fileName: String(row.fileName ?? "").trim(), timeoutMs }).catch((err) => {
        throw new Error(`Form field "${name}": ${err.message}`);
      });
      form.append(name, new Blob([file.buffer], { type: file.mimeType }), file.fileName);
    } else {
      form.append(name, row.value == null ? "" : typeof row.value === "object" ? JSON.stringify(row.value) : String(row.value));
    }
  }
  return form;
}

function lines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took longer than ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function formatLog(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const input = {
  label: "Input",
  description: "Entry point. Defines the fields a run accepts and which URLs this workflow handles.",
  color: "#f97316",
  icon: "IN",
  inputs: false,
  noExpressions: true,
  subtitle: "{matchType} {matchValue}",
  params: [
    {
      name: "fields",
      label: "Input fields",
      type: "kv",
      keyLabel: "Field",
      valueLabel: "Default",
      required: true,
      default: [{ key: "url", value: "", required: true }],
    },
    { name: "urlField", label: "URL field", type: "string", default: "url" },
    { name: "matchType", label: "Match URLs", type: "select", options: ["none", "host", "prefix", "regex"], default: "none" },
    {
      name: "matchValue",
      label: "Match value",
      type: "string",
      default: "",
      placeholder: "example.com, cdn.example.com",
      show: { matchType: ["host", "prefix", "regex"] },
    },
    { name: "cacheSeconds", label: "Cache (seconds)", type: "number", default: 0 },
    { name: "onError", label: "On error", type: "select", options: ["error", "original"], default: "error" },
    { name: "testInput", label: "Test input", type: "json", default: '{\n  "url": "https://example.com/"\n}' },
  ],
  execute(params, ctx) {
    const raw = ctx.json && typeof ctx.json === "object" ? ctx.json : {};
    const data = { ...raw };
    for (const field of params.fields || []) {
      const key = String(field.key || "").trim();
      if (!key) continue;
      const missing = data[key] == null || data[key] === "";
      if (missing && field.value !== "" && field.value != null) data[key] = field.value;
      else if (missing && field.required) throw new Error(`Input field "${key}" is required`);
    }
    const urlValue = params.urlField ? data[params.urlField] : null;
    if (urlValue) {
      data.parts = helpers.urlParts(urlValue);
      const groups = helpers.matchUrl(params.matchType, params.matchValue, String(urlValue));
      if (groups) data.groups = groups;
    }
    return data;
  },
};

const http = {
  label: "HTTP Request",
  description: "Calls any URL and can upload files. Output has status, headers, cookies, final url, the parsed body, and file for images and other downloads.",
  color: "#3b82f6",
  icon: "HTTP",
  subtitle: "{method} {url}",
  params: [
    { name: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"], default: "GET" },
    { name: "url", label: "URL", type: "string", default: "{{ $json.url }}" },
    { name: "query", label: "Query parameters", type: "kv", default: [] },
    { name: "headers", label: "Headers", type: "kv", default: [] },
    {
      name: "bodyType",
      label: "Body",
      type: "select",
      options: [
        { value: "none", label: "None" },
        { value: "json", label: "JSON" },
        { value: "form", label: "Form, URL-encoded" },
        { value: "multipart", label: "Form data, with files (multipart)" },
        { value: "file", label: "File, raw bytes" },
        { value: "raw", label: "Raw text" },
      ],
      default: "none",
      show: { method: ["POST", "PUT", "PATCH", "DELETE"] },
    },
    {
      name: "body",
      label: "Body content",
      type: "text",
      default: "",
      show: { bodyType: ["json", "form", "raw"] },
    },
    { name: "multipart", label: "Form fields", type: "multipart", default: [], show: { bodyType: ["multipart"] } },
    {
      name: "file",
      label: "File",
      type: "string",
      default: "",
      placeholder: "Image URL, data: URL, base64, or {{ $json.file }}",
      show: { bodyType: ["file"] },
    },
    { name: "fileContentType", label: "Content type", type: "string", default: "", placeholder: "Detected from the file", show: { bodyType: ["file"] } },
    {
      name: "responseFormat",
      label: "Response",
      type: "select",
      options: [
        { value: "auto", label: "Auto (files for images, video, PDF …)" },
        { value: "json", label: "JSON" },
        { value: "text", label: "Text" },
        { value: "binary", label: "File (base64)" },
      ],
      default: "auto",
    },
    { name: "redirect", label: "Redirects", type: "select", options: ["follow", "manual"], default: "follow" },
    { name: "failOnError", label: "Fail on error status", type: "boolean", default: true },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", default: 10000 },
    { name: "repeat", label: "Repeat until a condition is met (polling)", type: "boolean", default: false },
    {
      name: "until",
      label: "Stop when",
      type: "conditions",
      unit: "condition",
      operators: conditions.OPERATORS,
      deferred: true,
      default: [{ left: "{{ $response.body.status }}", op: "equals", right: "done" }],
      show: { repeat: [true] },
    },
    { name: "intervalMs", label: "Wait between tries (ms)", type: "number", default: 3000, show: { repeat: [true] } },
    { name: "maxAttempts", label: "Give up after (tries)", type: "number", default: 20, show: { repeat: [true] } },
  ],
  // With Repeat on, sends the request until "Stop when" holds. From the second try, every field is
  // resolved again with $response (the previous try's response) and $attempt, so a poll can send back what it got.
  async execute(params, ctx) {
    if (!params.repeat) return sendRequest(params);
    let current = params;
    const maxAttempts = Math.min(Math.max(Number(params.maxAttempts) || 20, 1), 500);
    const intervalMs = Math.min(Math.max(Number(params.intervalMs) || 0, 0), 10 * 60 * 1000);
    for (let attempt = 1; ; attempt += 1) {
      const output = { ...(await sendRequest(current)), attempts: attempt };
      const rows = ctx.resolve(params.until, { $response: output, $attempt: attempt });
      if (conditions.matches(rows, "all")) return output;
      ctx.logs.push(`Try ${attempt}: not done yet`);
      if (attempt >= maxAttempts) {
        const error = new Error(`"Stop when" still wasn't met after ${attempt} tries`);
        error.output = output;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      current = ctx.reresolve({ $response: output, $attempt: attempt + 1 });
    }
  },
};

async function sendRequest(params) {
  const timeoutMs = Number(params.timeoutMs) || 10000;
  let target;
  try {
    target = new URL(String(params.url).trim());
  } catch {
    throw new Error(`Invalid URL: ${params.url}`);
  }
  if (!/^https?:$/.test(target.protocol)) throw new Error(`URL must be http(s): ${target}`);
  for (const [key, value] of Object.entries(helpers.kvToObject(params.query))) target.searchParams.set(key, value);

  const headers = helpers.kvToObject(params.headers);
  const hasHeader = (name) => Object.keys(headers).some((key) => key.toLowerCase() === name);
  const options = { method: params.method, headers, redirect: params.redirect === "manual" ? "manual" : "follow" };

  if (params.method !== "GET" && params.method !== "HEAD" && params.bodyType !== "none") {
    if (params.bodyType === "json") {
      options.body = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
      if (!hasHeader("content-type")) headers["Content-Type"] = "application/json";
    } else if (params.bodyType === "form") {
      options.body = new URLSearchParams(lines(params.body)).toString();
      if (!hasHeader("content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded";
    } else if (params.bodyType === "multipart") {
      options.body = await multipartBody(params.multipart, timeoutMs);
      // fetch writes the multipart boundary into Content-Type; a hand-set one would break the upload.
      for (const key of Object.keys(headers)) if (key.toLowerCase() === "content-type") delete headers[key];
    } else if (params.bodyType === "file") {
      const file = await loadFile(params.file, { mimeType: params.fileContentType, timeoutMs });
      options.body = file.buffer;
      if (!hasHeader("content-type")) headers["Content-Type"] = file.mimeType;
    } else {
      options.body = String(params.body ?? "");
    }
  }

  const res = await helpers.fetchWithTimeout(target.toString(), options, timeoutMs);
  const contentType = res.headers.get("content-type") || "";
  const asFile = params.method !== "HEAD" && (params.responseFormat === "binary" || (params.responseFormat === "auto" && res.ok && isBinaryType(contentType)));
  const file = asFile ? await fileFromResponse(res, res.url || target.toString()) : null;
  const text = file || params.method === "HEAD" ? "" : (await res.text()).slice(0, MAX_BODY_BYTES);

  let body = text;
  if (file) {
    body = "";
  } else if (params.responseFormat === "json") {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Response is not JSON: ${text.slice(0, 200)}`);
    }
  } else if (params.responseFormat === "auto" && (contentType.includes("json") || /^\s*[[{]/.test(text))) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  const cookies = helpers.setCookies(res);
  const output = {
    status: res.status,
    ok: res.ok,
    url: res.url || target.toString(),
    location: res.headers.get("location") || "",
    headers: Object.fromEntries(res.headers),
    cookies,
    cookieHeader: helpers.cookieHeader(cookies),
    body,
    ...(file ? { file } : {}),
  };
  const isRedirect = res.status >= 300 && res.status < 400;
  if (params.failOnError && !res.ok && !(isRedirect && params.redirect === "manual")) {
    const error = new Error(`HTTP ${res.status} from ${target.host}: ${text.slice(0, 200)}`);
    error.output = output;
    throw error;
  }
  return output;
}

const MAX_MATCHES = 1000;

const extract = {
  label: "Extract URL",
  description: "Finds URLs inside text or HTML: video files, URLs containing some text, or a regex. url is the first match, matches lists them all.",
  color: "#a855f7",
  icon: "URL",
  subtitle: "{mode} {pattern}",
  params: [
    { name: "source", label: "Text to search", type: "string", default: "{{ $json.body }}" },
    { name: "baseUrl", label: "Base URL", type: "string", default: "{{ $json.url }}" },
    { name: "mode", label: "Find", type: "select", options: ["video", "contains", "regex", "all"], default: "video" },
    {
      name: "pattern",
      label: "Pattern",
      type: "string",
      default: "",
      show: { mode: ["contains", "regex"] },
    },
    { name: "failIfNone", label: "Fail if not found", type: "boolean", default: true },
  ],
  execute(params) {
    const text = typeof params.source === "string" ? params.source : JSON.stringify(params.source ?? "");
    const base = params.baseUrl || undefined;
    const urls = helpers.extractUrls(text, base);
    const wanted = String(params.pattern || "").trim();
    let result = { url: null, groups: {} };
    let matches;

    if (params.mode === "regex") {
      const regex = helpers.compileRegex(wanted, "gi");
      if (!regex) throw new Error("Pattern is not a valid regular expression");
      const found = [...helpers.unescapePage(text).matchAll(regex)].map((match) => ({
        match,
        url: (() => {
          const raw = match.groups?.url ?? (match.length > 1 ? match[1] : match[0]);
          return helpers.absolute(raw, base) || raw;
        })(),
      }));
      const first = found[0];
      if (first) {
        const groups = { ...first.match.groups };
        first.match.slice(1).forEach((group, index) => (groups[index + 1] = group ?? ""));
        result = { url: first.url, match: first.match[0], groups };
      }
      matches = [...new Set(found.map((item) => item.url).filter(Boolean))];
    } else if (params.mode === "contains") {
      matches = urls.filter((url) => url.toLowerCase().includes(wanted.toLowerCase()));
    } else if (params.mode === "video") {
      matches = urls.filter((url) => helpers.VIDEO_URL.test(url));
    } else {
      matches = urls;
    }
    if (params.mode !== "regex") result.url = matches[0] || null;

    if (!result.url && params.failIfNone) {
      throw new Error(params.mode === "video" ? "No video URL found" : `Nothing matched "${wanted}"`);
    }
    return { ...result, matches: matches.slice(0, MAX_MATCHES), count: urls.length, urls: urls.slice(0, 200) };
  },
};

const code = {
  label: "Code",
  description: "Runs JavaScript. Return the object that becomes this node's output.",
  color: "#f59e0b",
  icon: "JS",
  kind: "batch",
  subtitle: "{mode}",
  params: [
    {
      name: "mode",
      label: "Run",
      type: "select",
      options: [
        { value: "each", label: "Once for each item" },
        { value: "all", label: "Once for all items" },
      ],
      default: "each",
    },
    {
      name: "code",
      label: "JavaScript",
      type: "code",
      default:
        "// $json = current item, $items = all items, $input = workflow input, $node['Name'].json = any earlier step\n// helpers: urlParts, extractUrls, unescapePage, cookieHeader, resolveRedirects; fetch is available.\n// Return an object for one item, or an array for several.\nconst url = new URL($json.url ?? $input.url);\n\nreturn {\n  ...$json,\n  url: url.toString(),\n};\n",
    },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", default: 5000 },
  ],
  async executeBatch({ items, resolveFor, scopeFor, logs }) {
    const params = resolveFor(items[0], 0);
    const run = (scope, fallback) => runScript(params, scope, logs, fallback);
    if (params.mode === "all") return asItems(await run(scopeFor(items[0], 0), items));
    const out = [];
    for (let index = 0; index < items.length; index += 1) out.push(...asItems(await run(scopeFor(items[index], index), [items[index]])));
    return out;
  },
};

function asItems(result) {
  return Array.isArray(result) ? result : [result];
}

async function runScript(params, scope, logs, fallback) {
  const timeoutMs = Number(params.timeoutMs) || 5000;
  const log = (...args) => logs.push(args.map(formatLog).join(" "));
  const sandbox = vm.createContext({
    ...scope,
    helpers,
    fetch,
    URL,
    URLSearchParams,
    FormData,
    Blob,
    File,
    Buffer,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    console: { log, info: log, warn: log, error: log },
  });
  const script = new vm.Script(`(async () => {\n${params.code}\n})()`, { filename: "code-node.js" });
  const result = await withTimeout(script.runInContext(sandbox, { timeout: timeoutMs }), timeoutMs, "Code");
  return result === undefined ? fallback : result;
}

const set = {
  label: "Set Fields",
  description: "Builds a new object from expressions without writing code.",
  color: "#14b8a6",
  icon: "SET",
  subtitle: "{fields}",
  params: [
    { name: "fields", label: "Fields", type: "kv", default: [{ key: "url", value: "{{ $json.url }}" }] },
    { name: "keepInput", label: "Keep incoming fields", type: "boolean", default: false },
  ],
  execute(params, ctx) {
    return objectFromRows(params.fields, params.keepInput && ctx.json && typeof ctx.json === "object" ? ctx.json : {});
  },
};

const redirects = {
  label: "Follow Redirects",
  description: "Walks the Location chain server-side (with cookies/headers) and returns the final URL.",
  color: "#ec4899",
  icon: "302",
  subtitle: "{url}",
  params: [
    { name: "url", label: "URL", type: "string", default: "{{ $json.url }}" },
    { name: "headers", label: "Headers", type: "kv", default: [] },
    { name: "cookie", label: "Cookie", type: "string", default: "", placeholder: "{{ $node['HTTP Request'].json.cookieHeader }}" },
    { name: "maxHops", label: "Max redirects", type: "number", default: 5 },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", default: 8000 },
  ],
  execute(params) {
    return helpers.resolveRedirects(String(params.url), {
      headers: helpers.kvToObject(params.headers),
      cookie: params.cookie,
      maxHops: Number(params.maxHops) || 5,
      timeoutMs: Number(params.timeoutMs) || 8000,
    });
  },
};

const respond = {
  label: "Output",
  description: "Shapes what the workflow returns: JSON fields, a redirect, or plain text.",
  color: "#22c55e",
  icon: "OUT",
  outputs: false,
  kind: "batch",
  subtitle: "{mode} {url}",
  params: [
    { name: "mode", label: "Respond with", type: "select", options: ["json", "redirect", "text"], default: "json" },
    {
      name: "items",
      label: "Items",
      type: "select",
      options: [
        { value: "first", label: "First item" },
        { value: "all", label: "All items as an array" },
      ],
      default: "first",
      show: { mode: ["json"] },
    },
    { name: "url", label: "Redirect URL", type: "string", default: "{{ $json.url }}", show: { mode: ["redirect"] } },
    {
      name: "fields",
      label: "JSON fields",
      type: "kv",
      default: [{ key: "url", value: "{{ $json.url }}" }],
      show: { mode: ["json"] },
    },
    { name: "text", label: "Text", type: "text", default: "{{ $json.url }}", show: { mode: ["text"] } },
    { name: "status", label: "HTTP status", type: "number", default: 0 },
  ],
  executeBatch({ items, resolveFor }) {
    const first = resolveFor(items[0], 0);
    if (first.mode === "json" && first.items === "all") {
      const bodies = items.map((item, index) => jsonBody(resolveFor(item, index), item));
      return [{ mode: "json", status: Number(first.status) || 200, url: bodies[0]?.url, body: bodies }];
    }
    return [respondOnce(first, items[0])];
  },
};

function jsonBody(params, item) {
  const fields = (params.fields || []).filter((row) => String(row.key || "").trim());
  return fields.length ? set.execute({ fields, keepInput: false }, { json: item }) : item;
}

function respondOnce(params, item) {
  if (params.mode === "redirect") {
    const url = String(params.url || "");
    if (!/^https?:\/\//i.test(url)) throw new Error(`Redirect URL is not http(s): ${url}`);
    return { mode: "redirect", status: Number(params.status) || 302, url };
  }
  if (params.mode === "text") return { mode: "text", status: Number(params.status) || 200, body: String(params.text ?? "") };
  const body = jsonBody(params, item);
  return { mode: "json", status: Number(params.status) || 200, url: body?.url, body };
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const split = {
  label: "Split",
  description: "Turns an array into separate items, so the next steps run once per element.",
  kind: "expand",
  subtitle: "{items}",
  params: [
    { name: "items", label: "Array to split", type: "string", default: "{{ $json.urls }}" },
    { name: "field", label: "Field for plain values", type: "string", default: "item", placeholder: "item" },
    { name: "keepInput", label: "Keep incoming fields on each item", type: "boolean", default: false },
  ],
  execute(params, ctx) {
    let list = params.items;
    if (typeof list === "string" && /^\s*\[/.test(list)) {
      try {
        list = JSON.parse(list);
      } catch {}
    }
    if (list == null || list === "") return [];
    if (!Array.isArray(list)) throw new Error(`Array to split resolved to ${typeof list}, not an array`);
    const field = String(params.field || "item").trim() || "item";
    return list.map((value) => {
      if (params.keepInput) return { ...(isPlainObject(ctx.json) ? ctx.json : {}), [field]: value };
      return isPlainObject(value) ? value : { [field]: value };
    });
  },
};

const conditionParam = {
  name: "conditions",
  label: "Conditions",
  type: "conditions",
  unit: "condition",
  operators: conditions.OPERATORS,
  default: [{ left: "{{ $json.status }}", op: "equals", right: "200" }],
};

const filter = {
  label: "Filter",
  description: "Keeps only the items that meet the conditions. The rest are dropped or sent to a second output.",
  kind: "route",
  subtitle: "{conditions}",
  params: [
    conditionParam,
    {
      name: "combine",
      label: "Keep an item when",
      type: "select",
      options: [
        { value: "all", label: "All conditions match" },
        { value: "any", label: "Any condition matches" },
      ],
      default: "all",
    },
    {
      name: "discarded",
      label: "Items that don't match",
      type: "select",
      options: [
        { value: "drop", label: "Drop them" },
        { value: "output", label: "Send to a Discarded output" },
      ],
      default: "drop",
    },
  ],
  execute(params) {
    if (conditions.matches(params.conditions, params.combine)) return [0];
    return params.discarded === "output" ? [1] : [];
  },
};

const route = {
  label: "Switch",
  description: "Sends each item to the output of the first rule it matches.",
  kind: "route",
  subtitle: "{rules}",
  params: [
    {
      name: "rules",
      label: "Rules",
      type: "conditions",
      labelled: true,
      unit: "rule",
      operators: conditions.OPERATORS,
      default: [
        { label: "Video", left: "{{ $json.url }}", op: "regex", right: "\\.(m3u8|mp4)" },
        { label: "Page", left: "{{ $json.url }}", op: "notEmpty", right: "" },
      ],
    },
    {
      name: "fallback",
      label: "Items that match no rule",
      type: "select",
      options: [
        { value: "drop", label: "Drop them" },
        { value: "output", label: "Send to a Fallback output" },
      ],
      default: "drop",
    },
    { name: "allMatches", label: "Send to every matching output", type: "boolean", default: false },
  ],
  execute(params) {
    const rules = params.rules || [];
    const hits = [];
    for (let index = 0; index < rules.length; index += 1) {
      if (!conditions.check(rules[index])) continue;
      hits.push(index);
      if (!params.allMatches) break;
    }
    if (!hits.length && params.fallback === "output") hits.push(rules.length);
    return hits;
  },
};

const aggregate = {
  label: "Aggregate",
  description: "Collects all incoming items back into a single item holding an array.",
  kind: "batch",
  subtitle: "into {field}",
  params: [
    { name: "field", label: "Output field", type: "string", default: "items" },
    { name: "value", label: "Value from each item", type: "string", default: "{{ $json }}" },
  ],
  executeBatch({ items, resolveFor }) {
    const first = resolveFor(items[0], 0);
    const field = String(first.field || "items").trim() || "items";
    const values = items.map((item, index) => resolveFor(item, index).value);
    return [{ [field]: values, count: values.length }];
  },
};

// What a finished run hands to whoever called it: the JSON body, or the redirect/text wrapped in an object.
function responseValue(response) {
  if (!response) return {};
  if (response.mode === "redirect") return { url: response.url };
  if (response.mode === "text") return { text: response.body };
  const body = response.body;
  return isPlainObject(body) ? body : { result: body };
}

// Builds an object from key/value rows; "a.b" keys nest. Values keep their type (objects, files).
function objectFromRows(rows, base = {}) {
  const out = { ...base };
  for (const row of rows || []) {
    const key = String(row.key || "").trim();
    if (!key) continue;
    const path = key.split(".");
    let target = out;
    path.slice(0, -1).forEach((part) => {
      if (!target[part] || typeof target[part] !== "object") target[part] = {};
      target = target[part];
    });
    target[path.at(-1)] = row.value;
  }
  return out;
}

const subworkflow = {
  pipelineOnly: true,
  label: "Run Workflow",
  description: "Runs another workflow with the input you give it. Output is what that workflow responds with.",
  color: "#6366f1",
  icon: "RUN",
  params: [
    { name: "workflow", label: "Workflow", type: "workflow", default: "" },
    { name: "passItem", label: "Send the incoming item as its input", type: "boolean", default: false },
    { name: "input", label: "Input fields", type: "kv", default: [{ key: "url", value: "{{ $json.url }}" }], show: { passItem: [false] } },
  ],
  async execute(params, ctx) {
    if (!params.workflow) throw new Error("Pick the workflow to run");
    const input = params.passItem ? (isPlainObject(ctx.json) ? { ...ctx.json } : {}) : objectFromRows(params.input);
    const execution = await ctx.services.callWorkflow(params.workflow, input);
    if (execution.status !== "success") {
      const at = execution.error?.nodeName ? ` at ${execution.error.nodeName}` : "";
      throw new Error(`"${execution.workflowName}" failed${at}: ${execution.error?.message}`);
    }
    return responseValue(execution.response);
  },
};

const HLS_URL = /\.m3u8(\?|#|$)/i;
const DEFAULT_FOLDER = "{{ $input.folder || 'files/' + $execution.id }}";

function fileNameFor(res, url, wanted) {
  if (wanted) return wanted;
  const disposition = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("content-disposition") || "")?.[1];
  const name = disposition || nameFromUrl(res.url || url);
  const ext = EXT_BY_MIME[baseMime(res.headers.get("content-type"))];
  if (name && /\.[a-z0-9]{2,5}$/i.test(name)) return name;
  return `${name || "download"}${ext ? `.${ext}` : ""}`;
}

const save = {
  pipelineOnly: true,
  label: "Save File",
  description: "Downloads a URL (video, image, .m3u8 stream) or takes a file and saves it to a folder on the server. Output is a small file reference other steps accept.",
  color: "#0ea5e9",
  icon: "SAVE",
  subtitle: "{source}",
  params: [
    { name: "source", label: "File or URL", type: "string", default: "{{ $json.url }}", placeholder: "https://…/video.mp4, .m3u8, or {{ $json.file }}" },
    { name: "folder", label: "Folder", type: "string", default: DEFAULT_FOLDER },
    { name: "fileName", label: "File name", type: "string", default: "", placeholder: "Taken from the URL" },
    { name: "headers", label: "Headers", type: "kv", default: [] },
    { name: "maxMB", label: "Size limit (MB)", type: "number", default: 2048 },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", default: 600000 },
  ],
  async execute(params) {
    const source = params.source;
    const folder = params.folder;
    const wanted = String(params.fileName || "").trim();
    const timeoutMs = Number(params.timeoutMs) || 600000;
    const headers = helpers.kvToObject(params.headers);

    if (storage.isRef(source) || storage.isRef(source?.file)) return storage.isRef(source) ? source : source.file;

    const text = typeof source === "string" ? source.trim() : "";
    if (/^https?:\/\//i.test(text) && HLS_URL.test(text)) {
      const relative = storage.reservePath(folder, wanted || `${nameFromUrl(text).replace(/\.m3u8$/i, "") || "video"}.mp4`);
      await ffmpeg.remux(text, storage.absolutePath(relative), { headers, timeoutMs });
      return storage.refForExisting(relative, "video/mp4");
    }
    if (/^https?:\/\//i.test(text)) {
      const res = await helpers.fetchWithTimeout(text, { headers, redirect: "follow" }, timeoutMs);
      if (!res.ok) throw new Error(`Downloading ${text} answered HTTP ${res.status}`);
      const fileName = fileNameFor(res, text, wanted);
      const mimeType = baseMime(res.headers.get("content-type"));
      return storage.saveStream(folder, fileName, res, {
        mimeType: mimeType && mimeType !== "application/octet-stream" ? mimeType : mimeFromName(fileName),
        maxBytes: (Number(params.maxMB) || 2048) * 1048576,
      });
    }
    const file = await loadFile(source, { fileName: wanted, timeoutMs });
    return storage.saveBuffer(folder, file.fileName, file.buffer, file.mimeType);
  },
};

function videoSource(value) {
  if (storage.isRef(value)) return storage.pathOf(value);
  if (storage.isRef(value?.file)) return storage.pathOf(value.file);
  const text = typeof value === "string" ? value.trim() : "";
  if (/^https?:\/\//i.test(text)) return text;
  throw new Error("Video must be a saved file (from Save File) or an http(s) URL");
}

const frames = {
  pipelineOnly: true,
  label: "Extract Frames",
  description: "Takes evenly spaced still frames from a video with ffmpeg and saves them as JPEGs. Output: duration and a frames list.",
  color: "#d946ef",
  icon: "FRM",
  subtitle: "{count} frames",
  params: [
    { name: "video", label: "Video", type: "string", default: "{{ $json }}", placeholder: "{{ $json }} from Save File, or a video URL" },
    { name: "count", label: "Number of frames", type: "number", default: 8 },
    { name: "width", label: "Max width (px)", type: "number", default: 960 },
    { name: "folder", label: "Folder", type: "string", default: DEFAULT_FOLDER },
    { name: "headers", label: "Headers", type: "kv", default: [] },
    { name: "timeoutMs", label: "Timeout per frame (ms)", type: "number", default: 60000 },
  ],
  async execute(params) {
    const source = videoSource(params.video);
    const headers = helpers.kvToObject(params.headers);
    const timeoutMs = Number(params.timeoutMs) || 60000;
    const count = Math.min(Math.max(Number(params.count) || 8, 1), 48);
    const width = Math.min(Math.max(Number(params.width) || 960, 64), 3840);

    const duration = await ffmpeg.duration(source, { headers, timeoutMs });
    if (!duration) throw new Error("Couldn't read the video's length, so frames can't be spaced out");

    const list = [];
    for (let i = 0; i < count; i += 1) {
      const time = (duration * (i + 0.5)) / count;
      const relative = storage.reservePath(params.folder, `frame-${String(i + 1).padStart(2, "0")}.jpg`);
      await ffmpeg.frame(source, storage.absolutePath(relative), { time, width, headers, timeoutMs });
      list.push({ ...storage.refForExisting(relative, "image/jpeg"), time: Math.round(time * 10) / 10 });
    }
    return { duration: Math.round(duration), count: list.length, frames: list };
  },
};

const MAX_RESIZE_ATTEMPTS = 15;
const IMAGE_FORMATS = { jpeg: { ext: "jpg", mime: "image/jpeg" }, webp: { ext: "webp", mime: "image/webp" }, png: { ext: "png", mime: "image/png" } };

const resize = {
  pipelineOnly: true,
  label: "Resize Image",
  description: "Shrinks and re-encodes an image with ffmpeg, e.g. for a thumbnail. Output: file, dataUrl, width, height and size.",
  color: "#06b6d4",
  icon: "IMG",
  subtitle: "{format} {maxWidth}×{maxHeight}",
  params: [
    { name: "image", label: "Image", type: "string", default: "{{ $json.image }}", placeholder: "A file like {{ $json.image }}, an image URL, data: URL or base64" },
    { name: "maxWidth", label: "Max width (px)", type: "number", default: 400 },
    { name: "maxHeight", label: "Max height (px)", type: "number", default: 400 },
    { name: "format", label: "Format", type: "select", options: ["jpeg", "webp", "png"], default: "jpeg" },
    { name: "quality", label: "Quality (1-100)", type: "number", default: 75, show: { format: ["jpeg", "webp"] } },
    { name: "maxKB", label: "Keep under (KB, 0 = no limit)", type: "number", default: 0, show: { format: ["jpeg", "webp"] } },
  ],
  // With "Keep under", lowers the quality first (down to 40), then the dimensions, until the file fits.
  async execute(params) {
    const source = await loadFile(params.image);
    const format = IMAGE_FORMATS[params.format] ? params.format : "jpeg";
    const { ext, mime } = IMAGE_FORMATS[format];
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "resize-"));
    try {
      const input = path.join(dir, "input");
      const output = path.join(dir, `output.${ext}`);
      await fs.promises.writeFile(input, source.buffer);
      const limit = format === "png" ? 0 : Math.max(Number(params.maxKB) || 0, 0) * 1024;
      const original = await ffmpeg.imageSize(input);
      let width = Math.min(Math.max(Number(params.maxWidth) || 400, 1), 8000, original.width || Infinity);
      let height = Math.min(Math.max(Number(params.maxHeight) || 400, 1), 8000, original.height || Infinity);
      let quality = Math.min(Math.max(Number(params.quality) || 75, 1), 100);
      let buffer;
      for (let attempt = 1; ; attempt += 1) {
        await ffmpeg.resizeImage(input, output, { maxWidth: width, maxHeight: height, format, quality });
        buffer = await fs.promises.readFile(output);
        if (!limit || buffer.length <= limit) break;
        if (attempt >= MAX_RESIZE_ATTEMPTS) throw new Error(`Couldn't get the image under ${params.maxKB} KB (smallest try was ${Math.ceil(buffer.length / 1024)} KB)`);
        if (quality > 40) quality = Math.max(40, quality - 10);
        else {
          width = Math.max(32, Math.round(width * 0.8));
          height = Math.max(32, Math.round(height * 0.8));
        }
      }
      const data = buffer.toString("base64");
      const stem = String(source.fileName || "image").replace(/\.[^.]+$/, "");
      return {
        file: { data, mimeType: mime, fileName: `${stem}.${ext}`, size: buffer.length },
        dataUrl: `data:${mime};base64,${data}`,
        ...(await ffmpeg.imageSize(output)),
        size: buffer.length,
        originalSize: source.buffer.length,
        ...(format === "png" ? {} : { quality }),
      };
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  },
};

async function categoryIdFor(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return text;
  const categories = require("./site/categories");
  const match = (await categories.list()).find((category) => category.name.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`No category is named "${text}"`);
  return String(match.id);
}

const post = {
  pipelineOnly: true,
  label: "Create Post",
  description: "Adds a post to the website's Content, with the same checks as the Content form. Output is the new post.",
  color: "#10b981",
  icon: "POST",
  subtitle: "{title}",
  params: [
    { name: "title", label: "Title", type: "string", default: "{{ $json.title }}" },
    { name: "description", label: "Description", type: "text", default: "{{ $json.description }}" },
    { name: "realUrl", label: "Real URL", type: "string", default: "{{ $json.realUrl }}" },
    { name: "thumbnail", label: "Thumbnail URL", type: "string", default: "{{ $json.thumbnail }}" },
    { name: "category", label: "Category (name or id)", type: "string", default: "" },
    { name: "duration", label: "Video length", type: "string", default: "", placeholder: "Blank reads it from the .m3u8" },
    { name: "postTag", label: "Post tag", type: "string", default: "", placeholder: "Built from the title" },
  ],
  async execute(params) {
    // Loaded here because the site modules reach back into the workflow engine.
    const db = require("./site/db");
    const { createPost, InputError, SITE_URL } = require("./site/inputs");
    if (!db.configured) throw new Error("The website database is not configured, so posts can't be created");
    const text = (value) => (value == null ? "" : String(value));
    try {
      const created = await createPost({
        title: text(params.title),
        description: text(params.description),
        realUrl: text(params.realUrl),
        thumbnail: text(params.thumbnail),
        categoryId: await categoryIdFor(params.category),
        duration: text(params.duration),
        postTag: text(params.postTag),
      });
      return { ...created, viewUrl: SITE_URL ? `${SITE_URL}/r/${encodeURIComponent(created.postTag)}` : "" };
    } catch (err) {
      if (err instanceof InputError) throw new Error(Object.entries(err.errors).map(([field, message]) => `${field}: ${message}`).join("; "));
      throw err;
    }
  },
};

const NODE_TYPES = { input, http, extract, code, set, redirects, split, filter, switch: route, aggregate, subworkflow, save, frames, resize, post, respond };

function publicTypes() {
  return Object.fromEntries(
    Object.entries(NODE_TYPES).map(([type, def]) => [
      type,
      {
        type,
        label: def.label,
        description: def.description,
        color: def.color,
        icon: def.icon,
        subtitle: def.subtitle,
        inputs: def.inputs !== false,
        outputs: def.outputs !== false,
        kind: def.kind || "each",
        pipelineOnly: Boolean(def.pipelineOnly),
        params: def.params,
      },
    ])
  );
}

module.exports = { NODE_TYPES, publicTypes, responseValue, objectFromRows };
