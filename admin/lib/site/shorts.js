const { getPool } = require("./db");

// The API server creates the same table; whichever starts first on a database makes it.
const CREATE_SHORTS = `
CREATE TABLE IF NOT EXISTS shorts (
  id                INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  title             VARCHAR(255)   NOT NULL,
  video_url         VARCHAR(2048)  NOT NULL,
  thumbnail         VARCHAR(2048)  NOT NULL DEFAULT '',
  duration_seconds  INT UNSIGNED   NULL,
  category_id       INT            NULL,
  is_enabled        TINYINT(1)     NOT NULL DEFAULT 1,
  created_at        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_shorts_enabled_created (is_enabled, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const SELECT = `SELECT s.id, s.title, s.video_url, s.thumbnail, s.duration_seconds, s.category_id, s.is_enabled, s.created_at,
  c.name AS category_name, c.avatar AS category_avatar
  FROM shorts s LEFT JOIN categories c ON c.id = s.category_id`;

let tableReady = null;
function ensureTable() {
  tableReady ||= getPool()
    .query(CREATE_SHORTS)
    .catch((err) => {
      tableReady = null;
      throw err;
    });
  return tableReady;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toShort(row) {
  return {
    id: row.id,
    title: row.title,
    videoUrl: row.video_url,
    thumbnail: row.thumbnail || "",
    durationSeconds: row.duration_seconds || null,
    categoryId: row.category_id || null,
    category: row.category_id && row.category_name ? { id: row.category_id, name: row.category_name, avatar: row.category_avatar || "" } : null,
    enabled: Boolean(row.is_enabled),
    createdAt: row.created_at,
  };
}

async function list() {
  await ensureTable();
  const [rows] = await getPool().query(`${SELECT} ORDER BY s.created_at DESC, s.id DESC`);
  return rows.map(toShort);
}

async function get(id) {
  const parsed = parseId(id);
  if (!parsed) return null;
  await ensureTable();
  const [rows] = await getPool().query(`${SELECT} WHERE s.id = ?`, [parsed]);
  return rows.length ? toShort(rows[0]) : null;
}

async function create({ title, videoUrl, thumbnail, durationSeconds, categoryId }) {
  await ensureTable();
  const [result] = await getPool().query(
    "INSERT INTO shorts (title, video_url, thumbnail, duration_seconds, category_id) VALUES (?, ?, ?, ?, ?)",
    [title, videoUrl, thumbnail, durationSeconds, categoryId]
  );
  return result.insertId;
}

async function update(id, { title, videoUrl, thumbnail, durationSeconds, categoryId }) {
  const [result] = await getPool().query(
    "UPDATE shorts SET title = ?, video_url = ?, thumbnail = ?, duration_seconds = ?, category_id = ? WHERE id = ?",
    [title, videoUrl, thumbnail, durationSeconds, categoryId, id]
  );
  return result.affectedRows > 0;
}

async function setEnabled(id, enabled) {
  const parsed = parseId(id);
  if (!parsed) return false;
  const [result] = await getPool().query("UPDATE shorts SET is_enabled = ? WHERE id = ?", [enabled ? 1 : 0, parsed]);
  return result.affectedRows > 0;
}

async function remove(id) {
  const parsed = parseId(id);
  if (!parsed) return false;
  const [result] = await getPool().query("DELETE FROM shorts WHERE id = ?", [parsed]);
  return result.affectedRows > 0;
}

module.exports = { list, get, create, update, setEnabled, remove, parseId };
