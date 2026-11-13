// Workflow variables kept in the app, encrypted with AES-256-GCM. The key comes from SECRETS_KEY,
// which stays out of the database, so a copy of the database alone can't reveal any value.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("./site/db");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "variables.json");
const NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const MAX_VALUE_LENGTH = 16 * 1024;
// Shorter values would mask ordinary words in run history.
const MIN_REDACT_LENGTH = 6;
const FORMAT = "v1";

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS workflow_variables (
  name        VARCHAR(64)   NOT NULL,
  value       TEXT          NOT NULL,
  updated_at  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

class VariableError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Any passphrase works; hashing it gives the 32 bytes AES-256 needs.
function masterKey() {
  const raw = String(process.env.SECRETS_KEY || "").trim();
  return raw ? crypto.createHash("sha256").update(raw).digest() : null;
}

// The name is authenticated data, so a value moved onto another name fails to decrypt.
function encrypt(name, value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [FORMAT, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

function decrypt(name, blob, key) {
  const [format, iv, tag, data] = String(blob).split(":");
  if (format !== FORMAT || !data) throw new Error("Unknown format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

const fileBackend = {
  async load() {
    if (!fs.existsSync(FILE)) return [];
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Object.entries(saved).map(([name, row]) => ({ name, value: row.value, updatedAt: row.updatedAt }));
  },
  async writeAll(rows) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries([...rows].map(([name, row]) => [name, { value: row.value, updatedAt: row.updatedAt }])), null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  },
  async write(name, row, rows) {
    await this.writeAll(rows);
  },
  async delete(name, rows) {
    await this.writeAll(rows);
  },
};

const dbBackend = {
  async load() {
    await db.getPool().query(CREATE_TABLE);
    const [rows] = await db.getPool().query("SELECT name, value, updated_at FROM workflow_variables");
    return rows.map((row) => ({ name: row.name, value: row.value, updatedAt: new Date(row.updated_at).toISOString() }));
  },
  async write(name, row) {
    await db.getPool().query(
      "INSERT INTO workflow_variables (name, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
      [name, row.value, new Date(row.updatedAt)]
    );
  },
  async delete(name) {
    await db.getPool().query("DELETE FROM workflow_variables WHERE name = ?", [name]);
  },
};

const backend = db.configured ? dbBackend : fileBackend;

// name -> { value: encrypted blob, updatedAt }, and name -> decrypted value for the ones the key opens.
const rows = new Map();
let plain = new Map();

function decryptAll() {
  const key = masterKey();
  const next = new Map();
  if (key) {
    for (const [name, row] of rows) {
      try {
        next.set(name, decrypt(name, row.value, key));
      } catch {
        console.error(`Variable ${name} can't be decrypted with the current SECRETS_KEY`);
      }
    }
  }
  plain = next;
}

async function init() {
  const loaded = await backend.load();
  rows.clear();
  for (const row of loaded) rows.set(row.name, { value: row.value, updatedAt: row.updatedAt });
  decryptAll();
}

function checkName(name) {
  if (!NAME_RULE.test(String(name || ""))) throw new VariableError("Use letters, digits and _ only, starting with a letter or _, up to 64 characters.");
}

async function set(name, value) {
  checkName(name);
  const key = masterKey();
  if (!key) throw new VariableError("Set SECRETS_KEY in the server's environment before adding variables.", 409);
  const text = String(value ?? "");
  if (!text) throw new VariableError("Value can't be empty.");
  if (text.length > MAX_VALUE_LENGTH) throw new VariableError("Value is over 16 KB.");
  const row = { value: encrypt(name, text, key), updatedAt: new Date().toISOString() };
  rows.set(name, row);
  await backend.write(name, row, rows);
  plain.set(name, text);
}

async function remove(name) {
  if (!rows.has(name)) return false;
  rows.delete(name);
  plain.delete(name);
  await backend.delete(name, rows);
  return true;
}

// Only the last 4 characters, and only for values long enough that this gives nothing useful away.
function hint(value) {
  if (value == null) return null;
  return value.length >= 12 ? `••••${value.slice(-4)}` : "••••••";
}

function list() {
  return [...rows.entries()]
    .map(([name, row]) => ({ name, hint: hint(plain.get(name)), readable: plain.has(name), updatedAt: row.updatedAt }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const values = () => Object.fromEntries(plain);
const configured = () => Boolean(masterKey());

function redactText(text) {
  let out = String(text);
  for (const [name, value] of plain) {
    if (value.length >= MIN_REDACT_LENGTH && out.includes(value)) out = out.split(value).join(`[${name}]`);
  }
  return out;
}

// Copies the value with every variable's text replaced by its name, for run history and error messages.
function redact(value) {
  if (!plain.size) return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
}

module.exports = { VariableError, NAME_RULE, init, set, remove, list, values, configured, redact, redactText };
