const { getPool } = require("./db");

// The API server creates the same table; whichever starts first on a database makes it.
const CREATE_TERABOX_VIDEOS = `
CREATE TABLE IF NOT EXISTS terabox_videos (
  id           INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  video_key    VARCHAR(32)    NOT NULL,
  title        VARCHAR(255)   NOT NULL,
  terabox_url  VARCHAR(2048)  NULL,
  thumbnail    VARCHAR(2048)  NOT NULL DEFAULT '',
  duration     VARCHAR(16)    NOT NULL DEFAULT '',
  views        INT UNSIGNED   NOT NULL DEFAULT 0,
  created_at   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_terabox_videos_key (video_key),
  UNIQUE KEY uq_terabox_videos_url (terabox_url(255)),
  KEY ix_terabox_videos_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// Tables made before views were counted lack the column.
async function createTable() {
  await getPool().query(CREATE_TERABOX_VIDEOS);
  await getPool()
    .query("ALTER TABLE terabox_videos ADD COLUMN views INT UNSIGNED NOT NULL DEFAULT 0 AFTER duration")
    .catch((err) => {
      if (err.code !== "ER_DUP_FIELDNAME") throw err;
    });
}

let tableReady = null;
function ensureTable() {
  tableReady ||= createTable()
    .catch((err) => {
      tableReady = null;
      throw err;
    });
  return tableReady;
}

const SELECT = "SELECT id, video_key, title, terabox_url, thumbnail, duration, views, created_at, updated_at FROM terabox_videos";

function toVideo(row) {
  return {
    id: row.id,
    key: row.video_key,
    title: row.title,
    teraboxUrl: row.terabox_url || "",
    thumbnail: row.thumbnail || "",
    duration: row.duration || "",
    views: Number(row.views) || 0,
    public: Boolean(row.terabox_url),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Every Terabox video, including unfinished ones with no Terabox URL yet (those stay off the site). */
async function list() {
  await ensureTable();
  const [rows] = await getPool().query(`${SELECT} ORDER BY created_at DESC, id DESC`);
  return rows.map(toVideo);
}

async function get(id) {
  const parsed = parseId(id);
  if (!parsed) return null;
  await ensureTable();
  const [rows] = await getPool().query(`${SELECT} WHERE id = ?`, [parsed]);
  return rows.length ? toVideo(rows[0]) : null;
}

async function keyTaken(key, exceptId) {
  const [rows] = await getPool().query("SELECT 1 FROM terabox_videos WHERE video_key = ? AND id <> ? LIMIT 1", [key, exceptId]);
  return rows.length > 0;
}

async function urlTaken(url, exceptId) {
  if (!url) return false;
  const [rows] = await getPool().query("SELECT 1 FROM terabox_videos WHERE terabox_url = ? AND id <> ? LIMIT 1", [url, exceptId]);
  return rows.length > 0;
}

// An empty Terabox URL is stored as NULL: the video goes back to unfinished and leaves the site.
async function update(id, { key, title, teraboxUrl, thumbnail, duration }) {
  const [result] = await getPool().query(
    "UPDATE terabox_videos SET video_key = ?, title = ?, terabox_url = ?, thumbnail = ?, duration = ? WHERE id = ?",
    [key, title, teraboxUrl || null, thumbnail, duration, id]
  );
  return result.affectedRows > 0;
}

async function remove(id) {
  const parsed = parseId(id);
  if (!parsed) return false;
  const [result] = await getPool().query("DELETE FROM terabox_videos WHERE id = ?", [parsed]);
  return result.affectedRows > 0;
}

/** Lowercased keys and URLs already in the table; the unique indexes compare case-insensitively. */
async function takenKeysAndUrls() {
  await ensureTable();
  const [rows] = await getPool().query("SELECT video_key, terabox_url FROM terabox_videos");
  return {
    keys: new Set(rows.map((r) => r.video_key.toLowerCase())),
    urls: new Set(rows.filter((r) => r.terabox_url).map((r) => r.terabox_url.toLowerCase())),
  };
}

/** Adds the videos, quietly leaving out any whose key or URL was taken meanwhile. Returns how many were added. */
async function insertMany(videos) {
  await ensureTable();
  let added = 0;
  for (let i = 0; i < videos.length; i += 500) {
    const values = videos.slice(i, i + 500).map((v) => [v.key, v.title, v.teraboxUrl || null, v.thumbnail, v.duration, v.views || 0]);
    const [result] = await getPool().query(
      "INSERT IGNORE INTO terabox_videos (video_key, title, terabox_url, thumbnail, duration, views) VALUES ?",
      [values]
    );
    added += result.affectedRows;
  }
  return added;
}

module.exports = { list, get, keyTaken, urlTaken, update, remove, takenKeysAndUrls, insertMany };
