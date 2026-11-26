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

/** Every Terabox video, including unfinished ones with no Terabox URL yet (those stay off the site). */
async function list() {
  await ensureTable();
  const [rows] = await getPool().query(
    "SELECT id, video_key, title, terabox_url, thumbnail, duration, created_at FROM terabox_videos ORDER BY created_at DESC, id DESC"
  );
  return rows.map((row) => ({
    id: row.id,
    key: row.video_key,
    title: row.title,
    teraboxUrl: row.terabox_url || "",
    thumbnail: row.thumbnail || "",
    duration: row.duration || "",
    public: Boolean(row.terabox_url),
    createdAt: row.created_at,
  }));
}

module.exports = { list };
