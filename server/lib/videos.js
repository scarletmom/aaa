const { getPool } = require("./db");

const TAG_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const LIST_TTL_MS = 60 * 1000;
const COLUMNS = `r.post_tag, r.title, r.thumbnail, r.description, r.real_url, r.real_url_type, r.run_workflow, r.views, r.duration_seconds,
  r.created_at, r.category_id, c.name AS category_name, c.avatar AS category_avatar`;

const isValidTag = (tag) => typeof tag === "string" && TAG_PATTERN.test(tag);

// linkproxy adds these columns too; whichever starts first on an older database creates them. The defaults
// keep existing posts as they were: Player posts, and Iframe posts shown without running a workflow.
const ADDED_COLUMNS = [
  ["real_url_type", "VARCHAR(8) NOT NULL DEFAULT 'player' AFTER real_url"],
  ["run_workflow", "TINYINT(1) NOT NULL DEFAULT 0 AFTER real_url_type"],
];

let schemaReady = null;

function ensureSchema() {
  schemaReady ||= (async () => {
    const [rows] = await getPool().query(
      "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'resources'"
    );
    const present = new Set(rows.map((row) => row.name));
    for (const [name, definition] of ADDED_COLUMNS) {
      if (present.has(name)) continue;
      await getPool()
        .query(`ALTER TABLE resources ADD COLUMN ${name} ${definition}`)
        .catch((err) => {
          if (err.code !== "ER_DUP_FIELDNAME") throw err;
        });
    }
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function toVideo(row) {
  return {
    tag: row.post_tag,
    title: row.title,
    thumbnail: row.thumbnail || "",
    description: row.description || "",
    realUrl: row.real_url,
    realUrlType: row.real_url_type === "iframe" ? "iframe" : "player",
    runWorkflow: Boolean(row.run_workflow),
    views: Number(row.views) || 0,
    durationSeconds: row.duration_seconds || null,
    createdAt: row.created_at,
    category: row.category_id
      ? { id: row.category_id, name: row.category_name, slug: slugify(row.category_name), avatar: row.category_avatar || "" }
      : null,
  };
}

// The real URL never leaves the server; everything else is safe to hand to the browser.
function publicVideo({ realUrl, realUrlType, runWorkflow, ...video }) {
  return video;
}

// Edits made in linkproxy show up within LIST_TTL_MS. A failed refresh keeps serving the old list.
let cached = null;
let loading = null;

async function loadEnabled() {
  await ensureSchema();
  const [rows] = await getPool().query(
    `SELECT ${COLUMNS} FROM resources r LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.is_enabled = 1 ORDER BY r.sort_order ASC, r.created_at DESC`
  );
  return rows.map(toVideo);
}

async function listEnabled() {
  if (cached && Date.now() - cached.loadedAt < LIST_TTL_MS) return cached.videos;
  loading ||= loadEnabled()
    .then((videos) => {
      cached = { videos, loadedAt: Date.now() };
      return videos;
    })
    .catch((err) => {
      if (!cached) throw err;
      console.error(`video list refresh failed: ${err.message}`);
      cached.loadedAt = Date.now();
      return cached.videos;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function get(tag) {
  if (!isValidTag(tag)) return null;
  return (await listEnabled()).find((video) => video.tag === tag) || null;
}

// Same category first, then the rest of the catalogue in its usual order.
function related(video, all, limit = 12) {
  const rest = all.filter((item) => item.tag !== video.tag);
  const slug = video.category?.slug;
  const same = slug ? rest.filter((item) => item.category?.slug === slug) : [];
  const others = rest.filter((item) => !same.includes(item));
  const top = same.slice(0, limit);
  return { same: top, others: others.slice(0, limit - top.length) };
}

// updated_at is pinned so a view doesn't look like an edit in the admin.
async function addView(tag) {
  await getPool().query("UPDATE resources SET views = views + 1, updated_at = updated_at WHERE post_tag = ?", [tag]);
}

module.exports = { listEnabled, get, related, addView, publicVideo, isValidTag };
