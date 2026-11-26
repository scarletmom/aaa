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
  created_at   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_terabox_videos_key (video_key),
  UNIQUE KEY uq_terabox_videos_url (terabox_url(255)),
  KEY ix_terabox_videos_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let tableReady = null;
function ensureTable() {
  tableReady ||= getPool()
    .query(CREATE_TERABOX_VIDEOS)
    .catch((err) => {
      tableReady = null;
      throw err;
    });
  return tableReady;
}

const SELECT = "SELECT id, video_key, title, terabox_url, thumbnail, duration, created_at, updated_at FROM terabox_videos";

function toVideo(row) {
  return {
    id: row.id,
    key: row.video_key,
    title: row.title,
    teraboxUrl: row.terabox_url || "",
    thumbnail: row.thumbnail || "",
    duration: row.duration || "",
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

module.exports = { list, get, keyTaken, urlTaken, update, remove };
