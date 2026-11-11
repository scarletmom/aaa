const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("./site/db");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const WORKFLOW_DIR = path.join(DATA_DIR, "workflows");
const MAX_EXECUTIONS = Number(process.env.MAX_EXECUTIONS) || 100;
const MAX_STORED_STRING = 100 * 1024;

const CREATE_WORKFLOWS = `
CREATE TABLE IF NOT EXISTS workflows (
  id          VARCHAR(32)   NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  slug        VARCHAR(64)   NOT NULL,
  is_active   TINYINT(1)    NOT NULL DEFAULT 0,
  definition  MEDIUMTEXT    NOT NULL,
  created_at  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_workflows_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// Workflows live in MySQL when a database is configured, so the videos server can read and run
// them; otherwise in data/workflows/*.json. Either way they're mirrored in memory for fast reads.
const workflows = new Map();
const executions = [];
// Untrimmed copies of the latest runs, so a single-step run sees the same data a full run did.
const MAX_FULL_RUNS = 20;
const fullRuns = new Map();

const file = (id) => path.join(WORKFLOW_DIR, `${id}.json`);

function readFiles() {
  if (!fs.existsSync(WORKFLOW_DIR)) return [];
  const found = [];
  for (const name of fs.readdirSync(WORKFLOW_DIR)) {
    if (!name.endsWith(".json")) continue;
    try {
      found.push(JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, name), "utf8")));
    } catch (err) {
      console.error(`Skipping ${name}: ${err.message}`);
    }
  }
  return found;
}

const fileBackend = {
  name: "files",
  async load() {
    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
    return readFiles();
  },
  async write(workflow) {
    const tmp = `${file(workflow.id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(workflow, null, 2));
    fs.renameSync(tmp, file(workflow.id));
  },
  async delete(id) {
    fs.rmSync(file(id), { force: true });
  },
};

function fromRow(row) {
  const definition = JSON.parse(row.definition);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: Boolean(row.is_active),
    nodes: definition.nodes || [],
    connections: definition.connections || [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const dbBackend = {
  name: "mysql",
  async load() {
    await db.getPool().query(CREATE_WORKFLOWS);
    const [rows] = await db.getPool().query("SELECT id, name, slug, is_active, definition, created_at, updated_at FROM workflows");
    const loaded = rows.map(fromRow);
    // One-time move of workflows saved as files before the database was set up.
    if (!loaded.length) {
      for (const workflow of readFiles()) {
        await this.write(workflow);
        loaded.push(workflow);
      }
      if (loaded.length) console.log(`Moved ${loaded.length} workflow file(s) from ${WORKFLOW_DIR} into MySQL`);
    }
    return loaded;
  },
  async write(workflow) {
    const definition = JSON.stringify({ nodes: workflow.nodes, connections: workflow.connections });
    await db.getPool().query(
      `INSERT INTO workflows (id, name, slug, is_active, definition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug), is_active = VALUES(is_active),
         definition = VALUES(definition), updated_at = VALUES(updated_at)`,
      [workflow.id, workflow.name, workflow.slug, workflow.active ? 1 : 0, definition, new Date(workflow.createdAt), new Date(workflow.updatedAt)]
    );
  },
  async delete(id) {
    await db.getPool().query("DELETE FROM workflows WHERE id = ?", [id]);
  },
};

const backend = db.configured ? dbBackend : fileBackend;

async function init() {
  workflows.clear();
  for (const workflow of await backend.load()) workflows.set(workflow.id, workflow);
  return backend.name;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function uniqueSlug(wanted, id) {
  const base = slugify(wanted) || "workflow";
  let slug = base;
  for (let n = 2; [...workflows.values()].some((w) => w.slug === slug && w.id !== id); n += 1) slug = `${base}-${n}`;
  return slug;
}

function list() {
  return [...workflows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function get(id) {
  return workflows.get(id) || null;
}

function bySlug(slug) {
  return [...workflows.values()].find((w) => w.slug === slug) || null;
}

async function save(input, id = crypto.randomBytes(6).toString("hex")) {
  const existing = workflows.get(id);
  const workflow = {
    id,
    name: String(input.name || "Untitled workflow").slice(0, 120),
    slug: uniqueSlug(input.slug || input.name, id),
    active: Boolean(input.active),
    nodes: Array.isArray(input.nodes) ? input.nodes : [],
    connections: Array.isArray(input.connections) ? input.connections : [],
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await backend.write(workflow);
  workflows.set(id, workflow);
  return workflow;
}

async function remove(id) {
  if (!workflows.has(id)) return false;
  await backend.delete(id);
  workflows.delete(id);
  return true;
}

function trimStrings(value) {
  if (typeof value === "string") {
    return value.length > MAX_STORED_STRING ? `${value.slice(0, MAX_STORED_STRING)}… [${value.length} chars, truncated]` : value;
  }
  if (Array.isArray(value)) return value.map(trimStrings);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimStrings(v)]));
  return value;
}

function record(execution) {
  fullRuns.set(execution.id, execution);
  if (fullRuns.size > MAX_FULL_RUNS) fullRuns.delete(fullRuns.keys().next().value);
  const stored = trimStrings(execution);
  executions.unshift(stored);
  executions.length = Math.min(executions.length, MAX_EXECUTIONS);
  return stored;
}

function listExecutions(workflowId) {
  return executions
    .filter((e) => !workflowId || e.workflowId === workflowId)
    .map(({ id, workflowId: wid, workflowName, mode, startedAt, status, durationMs, error }) => ({
      id,
      workflowId: wid,
      workflowName,
      mode,
      startedAt,
      status,
      durationMs,
      error: error?.message || null,
    }));
}

function getExecution(id) {
  return executions.find((e) => e.id === id) || null;
}

function getFullExecution(id) {
  return fullRuns.get(id) || getExecution(id);
}

module.exports = {
  init,
  list,
  get,
  bySlug,
  save,
  remove,
  record,
  listExecutions,
  getExecution,
  getFullExecution,
  trimStrings,
  workflowCount: () => workflows.size,
};
