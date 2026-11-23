// Reel to post progress, kept in the database so a reel can be continued later or from another device.
const crypto = require("node:crypto");
const db = require("./site/db");

const RECENT_LIMIT = 20;
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const MAX_URL_LENGTH = 2048;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS reel_drafts (
  id          VARCHAR(32)    NOT NULL,
  reel_key    VARCHAR(191)   NOT NULL,
  reel_url    VARCHAR(2048)  NOT NULL,
  title       VARCHAR(255)   NOT NULL DEFAULT '',
  thumbnail   VARCHAR(2048)  NOT NULL DEFAULT '',
  stage       VARCHAR(16)    NOT NULL DEFAULT 'frame',
  draft       MEDIUMTEXT     NOT NULL,
  created_at  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_reel_drafts_key (reel_key),
  KEY ix_reel_drafts_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

class DraftError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

let tableReady = null;
function ensureTable() {
  tableReady ||= db
    .getPool()
    .query(CREATE_TABLE)
    .catch((err) => {
      tableReady = null;
      throw err;
    });
  return tableReady;
}

// The same reel shared as /reel/, /reels/ or /p/, with or without tracking parameters, is one draft.
function reelKey(url) {
  let parsed;
  try {
    parsed = new URL(String(url || "").trim());
  } catch {
    throw new DraftError("The reel link must be a full http(s) URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new DraftError("The reel link must be a full http(s) URL");
  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (host === "instagram.com" || host === "instagr.am") {
    const code = /\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/.exec(parsed.pathname)?.[1];
    if (code) return `instagram:${code}`;
  }
  const rest = `${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  const key = `${host}${rest}`;
  return key.length <= 191 ? key : `${host}#${crypto.createHash("sha256").update(rest).digest("hex")}`;
}

const STAGES = ["frame", "details", "post", "share", "shared"];

function stageOf(draft) {
  if (draft.share?.sent) return "shared";
  if (draft.post) return "share";
  if (draft.form?.title || draft.form?.realUrl) return "post";
  if (draft.matches) return "details";
  return "frame";
}

const clip = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

function summaryOf(draft) {
  return {
    title: clip(draft.post?.title || draft.form?.title, 255),
    thumbnail: clip(draft.form?.thumbnail, MAX_URL_LENGTH),
    stage: stageOf(draft),
  };
}

function validDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new DraftError("draft must be an object");
  if (!draft.reelUrl) throw new DraftError("draft.reelUrl is required");
  if (String(draft.reelUrl).length > MAX_URL_LENGTH) throw new DraftError("The reel link is too long");
  const json = JSON.stringify(draft);
  if (Buffer.byteLength(json) > MAX_DRAFT_BYTES) throw new DraftError("This reel's progress is too large to save", 413);
  return json;
}

const rowSummary = (row) => ({
  id: row.id,
  reelUrl: row.reel_url,
  title: row.title,
  thumbnail: row.thumbnail,
  stage: STAGES.includes(row.stage) ? row.stage : "frame",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function recent() {
  await ensureTable();
  const [rows] = await db
    .getPool()
    .query("SELECT id, reel_url, title, thumbnail, stage, created_at, updated_at FROM reel_drafts ORDER BY updated_at DESC LIMIT ?", [RECENT_LIMIT]);
  return rows.map(rowSummary);
}

async function get(id) {
  await ensureTable();
  const [rows] = await db.getPool().query("SELECT * FROM reel_drafts WHERE id = ?", [String(id)]);
  return rows[0] ? { ...rowSummary(rows[0]), draft: JSON.parse(rows[0].draft) } : null;
}

async function findByUrl(url) {
  await ensureTable();
  const [rows] = await db.getPool().query("SELECT id, reel_url, title, thumbnail, stage, created_at, updated_at FROM reel_drafts WHERE reel_key = ?", [reelKey(url)]);
  return rows[0] ? rowSummary(rows[0]) : null;
}

// Called after a download: one row per reel, so downloading a reel again keeps its saved progress
// unless it was already posted, in which case it starts over as a new post.
async function start(reelUrl, video) {
  if (!video || typeof video !== "object" || !video.url) throw new DraftError("video.url is required");
  const key = reelKey(reelUrl);
  await ensureTable();
  return db.transaction(async (connection) => {
    const [rows] = await connection.query("SELECT id, draft FROM reel_drafts WHERE reel_key = ? FOR UPDATE", [key]);
    const saved = rows[0] ? JSON.parse(rows[0].draft) : null;
    const draft = saved && !saved.post ? { ...saved, reelUrl, video } : { reelUrl, video };
    const json = validDraft(draft);
    const { title, thumbnail, stage } = summaryOf(draft);
    const id = rows[0]?.id || crypto.randomBytes(8).toString("hex");
    if (rows[0]) {
      await connection.query(
        "UPDATE reel_drafts SET reel_url = ?, title = ?, thumbnail = ?, stage = ?, draft = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
        [reelUrl, title, thumbnail, stage, json, id]
      );
    } else {
      await connection.query("INSERT INTO reel_drafts (id, reel_key, reel_url, title, thumbnail, stage, draft) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        id,
        key,
        reelUrl,
        title,
        thumbnail,
        stage,
        json,
      ]);
    }
    return { id, draft, resumed: Boolean(saved && !saved.post) };
  });
}

async function save(id, draft) {
  const json = validDraft(draft);
  const { title, thumbnail, stage } = summaryOf(draft);
  await ensureTable();
  const [result] = await db
    .getPool()
    .query("UPDATE reel_drafts SET title = ?, thumbnail = ?, stage = ?, draft = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [
      title,
      thumbnail,
      stage,
      json,
      String(id),
    ]);
  if (!result.affectedRows) throw new DraftError("This reel is no longer saved", 404);
}

async function remove(id) {
  await ensureTable();
  await db.getPool().query("DELETE FROM reel_drafts WHERE id = ?", [String(id)]);
}

module.exports = { DraftError, reelKey, recent, get, findByUrl, start, save, remove };
