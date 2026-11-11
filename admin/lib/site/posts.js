const { getPool, transaction } = require("./db");

const TAG_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const COLUMNS = `r.post_tag, r.title, r.thumbnail, r.description, r.real_url, r.sort_order, r.is_enabled,
  r.views, r.duration_seconds, r.created_at, r.updated_at, r.category_id, c.name AS category_name, c.avatar AS category_avatar`;
const FROM = "resources r LEFT JOIN categories c ON c.id = r.category_id";
const ORDER = "ORDER BY r.sort_order ASC, r.created_at DESC";

const isValidTag = (postTag) => typeof postTag === "string" && TAG_PATTERN.test(postTag);

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

function toPost(row, { withUrl = false } = {}) {
  return {
    postTag: row.post_tag,
    title: row.title,
    thumbnail: row.thumbnail,
    description: row.description,
    ...(withUrl ? { realUrl: row.real_url } : {}),
    sortOrder: row.sort_order,
    enabled: Boolean(row.is_enabled),
    views: Number(row.views) || 0,
    durationSeconds: row.duration_seconds || null,
    categoryId: row.category_id || null,
    category: row.category_id ? { id: row.category_id, name: row.category_name, avatar: row.category_avatar } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function list() {
  const [rows] = await getPool().query(`SELECT ${COLUMNS} FROM ${FROM} ${ORDER}`);
  return rows.map((row) => toPost(row, { withUrl: true }));
}

async function get(postTag) {
  if (!isValidTag(postTag)) return null;
  const [rows] = await getPool().query(`SELECT ${COLUMNS} FROM ${FROM} WHERE r.post_tag = ? LIMIT 1`, [postTag]);
  return rows.length ? toPost(rows[0], { withUrl: true }) : null;
}

async function exists(postTag) {
  const [rows] = await getPool().query("SELECT 1 FROM resources WHERE post_tag = ? LIMIT 1", [postTag]);
  return rows.length > 0;
}

// Slug of the title, with -2, -3 ... appended until the tag is free.
async function uniqueTag(source) {
  const root = slugify(source);
  if (!root) return "";
  let candidate = root;
  for (let counter = 2; await exists(candidate); counter += 1) {
    const suffix = `-${counter}`;
    candidate = root.slice(0, 64 - suffix.length) + suffix;
  }
  return candidate;
}

// New posts go above everything else, matching link-gate's admin.
async function create({ postTag, title, thumbnail, description, realUrl, categoryId = null, durationSeconds = null }) {
  const [[{ nextOrder }]] = await getPool().query("SELECT COALESCE(MIN(sort_order), 1) - 1 AS nextOrder FROM resources");
  await getPool().query(
    `INSERT INTO resources (post_tag, title, thumbnail, description, real_url, sort_order, category_id, duration_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [postTag, title, thumbnail, description, realUrl, nextOrder, categoryId, durationSeconds]
  );
}

async function update(postTag, { title, thumbnail, description, realUrl, categoryId = null, durationSeconds = null }) {
  const [result] = await getPool().query(
    `UPDATE resources SET title = ?, thumbnail = ?, description = ?, real_url = ?, category_id = ?, duration_seconds = ?
     WHERE post_tag = ?`,
    [title, thumbnail, description, realUrl, categoryId, durationSeconds, postTag]
  );
  return result.affectedRows > 0;
}

async function setEnabled(postTag, enabled) {
  const [result] = await getPool().query("UPDATE resources SET is_enabled = ? WHERE post_tag = ?", [enabled ? 1 : 0, postTag]);
  return result.affectedRows > 0;
}

async function move(postTag, direction) {
  const tags = (await list()).map((post) => post.postTag);
  const from = tags.indexOf(postTag);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= tags.length) return false;

  [tags[from], tags[to]] = [tags[to], tags[from]];
  await transaction(async (connection) => {
    for (let i = 0; i < tags.length; i += 1) {
      await connection.query("UPDATE resources SET sort_order = ? WHERE post_tag = ?", [i + 1, tags[i]]);
    }
  });
  return true;
}

async function remove(postTag) {
  const [result] = await getPool().query("DELETE FROM resources WHERE post_tag = ?", [postTag]);
  return result.affectedRows > 0;
}

module.exports = { list, get, exists, uniqueTag, create, update, setEnabled, move, remove, isValidTag, slugify };
