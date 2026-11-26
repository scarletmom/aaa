const { getPool } = require("./db");

const PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

// The admin (linkproxy) creates the same table; whichever starts first on a database makes it.
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
  KEY ix_terabox_videos_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// Without a Terabox URL a video isn't finished: only the admin sees it.
const IS_PUBLIC = "terabox_url IS NOT NULL AND terabox_url <> ''";

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

const likePattern = (text) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

function toVideo(row) {
  return {
    key: row.video_key,
    title: row.title,
    teraboxUrl: row.terabox_url,
    thumbnail: row.thumbnail || "",
    duration: row.duration || "",
    createdAt: row.created_at,
  };
}

/** One page of the public Terabox videos, newest first, optionally matching search words in the title. */
async function pageOf({ page, pageSize, q } = {}) {
  await ensureTable();
  const size = Math.min(Math.max(Math.floor(Number(pageSize)) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const needle = String(q ?? "").trim().slice(0, 100);
  const where = needle ? `${IS_PUBLIC} AND title LIKE ?` : IS_PUBLIC;
  const params = needle ? [likePattern(needle)] : [];

  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM terabox_videos WHERE ${where}`, params);
  const pages = Math.max(Math.ceil(Number(total) / size), 1);
  const current = Math.min(Math.max(Math.floor(Number(page)) || 1, 1), pages);
  const [rows] = await getPool().query(
    `SELECT video_key, title, terabox_url, thumbnail, duration, created_at FROM terabox_videos
     WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, size, (current - 1) * size]
  );
  return { videos: rows.map(toVideo), page: current, pages, pageSize: size, total: Number(total) };
}

module.exports = { pageOf };
