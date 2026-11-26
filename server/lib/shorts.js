const { getPool } = require("./db");

const LIST_TTL_MS = 60 * 1000;
const MAX_SHORTS = 200;

// The admin (linkproxy) creates the same table; whichever starts first on a database makes it.
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

function sourceType(url) {
  if (/\.m3u8(\?|#|$)/i.test(url)) return "hls";
  if (/\.mpd(\?|#|$)/i.test(url)) return "dash";
  return "native";
}

function toShort(row) {
  return {
    id: row.id,
    title: row.title,
    videoUrl: row.video_url,
    type: sourceType(row.video_url),
    thumbnail: row.thumbnail || "",
    durationSeconds: row.duration_seconds || null,
    createdAt: row.created_at,
    category: row.category_id && row.category_name ? { name: row.category_name, avatar: row.category_avatar || "" } : null,
  };
}

async function loadEnabled() {
  await ensureTable();
  const [rows] = await getPool().query(
    `SELECT s.id, s.title, s.video_url, s.thumbnail, s.duration_seconds, s.created_at, s.category_id,
       c.name AS category_name, c.avatar AS category_avatar
     FROM shorts s LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.is_enabled = 1 ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    [MAX_SHORTS]
  );
  return rows.map(toShort);
}

// Edits made in the admin show up within LIST_TTL_MS. A failed refresh keeps serving the old list.
let cached = null;
let loading = null;

async function listEnabled() {
  if (cached && Date.now() - cached.loadedAt < LIST_TTL_MS) return cached.shorts;
  loading ||= loadEnabled()
    .then((shorts) => {
      cached = { shorts, loadedAt: Date.now() };
      return shorts;
    })
    .catch((err) => {
      if (!cached) throw err;
      console.error(`shorts refresh failed: ${err.message}`);
      cached.loadedAt = Date.now();
      return cached.shorts;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

module.exports = { listEnabled };
