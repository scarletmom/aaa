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
  views        INT UNSIGNED   NOT NULL DEFAULT 0,
  created_at   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_terabox_videos_key (video_key),
  UNIQUE KEY uq_terabox_videos_url (terabox_url(255)),
  KEY ix_terabox_videos_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// Views per video per UTC day, for Trending; the video's total stays in terabox_videos.views.
const CREATE_TERABOX_VIDEO_VIEWS = `
CREATE TABLE IF NOT EXISTS terabox_video_views (
  video_id  INT UNSIGNED  NOT NULL,
  day       DATE          NOT NULL,
  views     INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (video_id, day),
  KEY ix_terabox_video_views_day (day),
  CONSTRAINT fk_terabox_video_views_video FOREIGN KEY (video_id) REFERENCES terabox_videos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const TRENDING_DAYS = 7;

// Without a Terabox URL a video isn't finished: only the admin sees it.
const IS_PUBLIC = "terabox_url IS NOT NULL AND terabox_url <> ''";

// Tables made before views were counted lack the column.
async function createTable() {
  await getPool().query(CREATE_TERABOX_VIDEOS);
  await getPool()
    .query("ALTER TABLE terabox_videos ADD COLUMN views INT UNSIGNED NOT NULL DEFAULT 0 AFTER duration")
    .catch((err) => {
      if (err.code !== "ER_DUP_FIELDNAME") throw err;
    });
  await getPool().query(CREATE_TERABOX_VIDEO_VIEWS);
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

const likePattern = (text) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

function toVideo(row) {
  return {
    key: row.video_key,
    title: row.title,
    teraboxUrl: row.terabox_url,
    thumbnail: row.thumbnail || "",
    duration: row.duration || "",
    views: Number(row.views) || 0,
    createdAt: row.created_at,
  };
}

// Trending ranks by views over the last 7 days, then by all-time views, so it is never empty.
const SORTS = {
  trending: {
    join: `LEFT JOIN (
      SELECT video_id, SUM(views) AS recent_views FROM terabox_video_views
      WHERE day > UTC_DATE() - INTERVAL ${TRENDING_DAYS} DAY GROUP BY video_id
    ) AS recent ON recent.video_id = v.id`,
    order: "COALESCE(recent.recent_views, 0) DESC, v.views DESC, v.created_at DESC, v.id DESC",
  },
  popular: { join: "", order: "v.views DESC, v.created_at DESC, v.id DESC" },
  recent: { join: "", order: "v.created_at DESC, v.id DESC" },
};

/** One page of the public Terabox videos in `sort` order (trending, popular or recent), optionally matching search words in the title. */
async function pageOf({ page, pageSize, q, sort } = {}) {
  await ensureTable();
  const size = Math.min(Math.max(Math.floor(Number(pageSize)) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const needle = String(q ?? "").trim().slice(0, 100);
  const where = needle ? `${IS_PUBLIC} AND title LIKE ?` : IS_PUBLIC;
  const params = needle ? [likePattern(needle)] : [];
  const sortName = Object.hasOwn(SORTS, String(sort)) ? String(sort) : "recent";
  const { join, order } = SORTS[sortName];

  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM terabox_videos WHERE ${where}`, params);
  const pages = Math.max(Math.ceil(Number(total) / size), 1);
  const current = Math.min(Math.max(Math.floor(Number(page)) || 1, 1), pages);
  const [rows] = await getPool().query(
    `SELECT v.video_key, v.title, v.terabox_url, v.thumbnail, v.duration, v.views, v.created_at
     FROM terabox_videos AS v ${join}
     WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, size, (current - 1) * size]
  );
  return { videos: rows.map(toVideo), page: current, pages, pageSize: size, total: Number(total), sort: sortName };
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

// updated_at is pinned so a view doesn't look like an edit in the admin.
async function addView(key) {
  if (!KEY_PATTERN.test(String(key))) return false;
  await ensureTable();
  const [[video]] = await getPool().query(`SELECT id FROM terabox_videos WHERE video_key = ? AND ${IS_PUBLIC}`, [key]);
  if (!video) return false;
  await getPool().query("UPDATE terabox_videos SET views = views + 1, updated_at = updated_at WHERE id = ?", [video.id]);
  await getPool().query(
    "INSERT INTO terabox_video_views (video_id, day, views) VALUES (?, UTC_DATE(), 1) ON DUPLICATE KEY UPDATE views = views + 1",
    [video.id]
  );
  return true;
}

module.exports = { pageOf, addView };
