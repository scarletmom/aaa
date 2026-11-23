const { getPool } = require("./db");

const PAGE_SIZE = 50;
const SITES = new Set(["videos", "news"]);
// The videos server creates the table on its first start; until then there's nothing to show.
const NO_TABLE = 1146;
const PUBLIC_ID = /^[0-9a-f]{64}$/;
const PLACE_LIMIT = 10;
const DEVICE_LIMIT = 6;

// The videos server adds visits.account_id on its next start; until then visits can't be linked to members.
async function linking() {
  const [rows] = await getPool().query(
    `SELECT TABLE_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'visits' AND COLUMN_NAME = 'account_id') OR (TABLE_NAME = 'accounts' AND COLUMN_NAME = 'public_id'))`
  );
  const tables = new Set(rows.map((row) => row.name));
  return tables.has("visits") && tables.has("accounts");
}

// A member's own visits, plus the ones from the same browsers while signed out (before signing in, say).
const MEMBER_SQL = `(account_id = ? OR (account_id IS NULL AND visitor_id IN
  (SELECT visitor_id FROM visits WHERE account_id = ? AND visitor_id IS NOT NULL)))`;

const effectiveRole = (row) =>
  row.role === "member-pro" && row.pro_until && new Date(row.pro_until).getTime() <= Date.now() ? "member-lite" : row.role;

function toVisit(row) {
  return {
    id: Number(row.id),
    at: row.created_at,
    site: row.site,
    path: row.path,
    referrer: row.referrer,
    visitorId: row.visitor_id,
    accountId: row.account_id || null,
    ip: row.ip,
    countryCode: row.country_code,
    country: row.country,
    region: row.region,
    city: row.city,
    postal: row.postal,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    accuracyKm: row.accuracy_km,
    timezone: row.timezone,
    asn: row.asn,
    isp: row.isp,
    connectionType: row.connection_type,
    downlinkMbps: row.downlink_mbps === null ? null : Number(row.downlink_mbps),
    rttMs: row.rtt_ms,
    device: row.device,
    os: row.os,
    browser: row.browser,
    userAgent: row.user_agent,
    language: row.language,
    screen: row.screen,
    clientTimezone: row.client_timezone,
  };
}

function filters({ site, q, user }, linked) {
  const where = [];
  const args = [];
  if (SITES.has(site)) {
    where.push("site = ?");
    args.push(site);
  }
  if (linked && PUBLIC_ID.test(user || "")) {
    where.push(MEMBER_SQL);
    args.push(user, user);
  }
  const query = String(q || "").trim().slice(0, 100);
  if (query) {
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const byName = linked ? " OR account_id IN (SELECT public_id FROM accounts WHERE full_name LIKE ?)" : "";
    where.push(`(ip LIKE ? OR city LIKE ? OR region LIKE ? OR country LIKE ? OR isp LIKE ? OR path LIKE ?${byName})`);
    args.push(like, like, like, like, like, like, ...(linked ? [like] : []));
  }
  return { where, args };
}

async function membersByIds(ids) {
  if (!ids.length) return new Map();
  const [rows] = await getPool().query("SELECT public_id, full_name, role, pro_until FROM accounts WHERE public_id IN (?)", [ids]);
  return new Map(rows.map((row) => [row.public_id, { id: row.public_id, name: row.full_name, role: effectiveRole(row) }]));
}

// Where and on what a member has been, over everything the visits table still holds.
async function memberSummary(user) {
  const [[account]] = await getPool().query("SELECT public_id, full_name, role, pro_until, created_at FROM accounts WHERE public_id = ?", [user]);
  if (!account) return null;
  const args = [user, user];
  const [[totals]] = await getPool().query(
    `SELECT COUNT(*) AS visits, SUM(account_id IS NOT NULL) AS signed_in, MIN(created_at) AS first_at, MAX(created_at) AS last_at,
            COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT visitor_id) AS browsers
       FROM visits WHERE ${MEMBER_SQL}`,
    args
  );
  const [places] = await getPool().query(
    `SELECT country_code AS code, MAX(country) AS country, MAX(region) AS region, city, COUNT(*) AS count, MAX(created_at) AS last_at
       FROM visits WHERE ${MEMBER_SQL} GROUP BY country_code, city ORDER BY last_at DESC LIMIT ${PLACE_LIMIT}`,
    args
  );
  const [devices] = await getPool().query(
    `SELECT device, os, browser, COUNT(*) AS count, MAX(created_at) AS last_at
       FROM visits WHERE ${MEMBER_SQL} GROUP BY device, os, browser ORDER BY last_at DESC LIMIT ${DEVICE_LIMIT}`,
    args
  );
  return {
    id: account.public_id,
    name: account.full_name,
    role: effectiveRole(account),
    joinedAt: account.created_at,
    visits: Number(totals.visits) || 0,
    signedIn: Number(totals.signed_in) || 0,
    firstAt: totals.first_at,
    lastAt: totals.last_at,
    ips: Number(totals.ips) || 0,
    browsers: Number(totals.browsers) || 0,
    places: places.map((row) => ({ code: row.code, country: row.country, region: row.region, city: row.city, count: Number(row.count), lastAt: row.last_at })),
    devices: devices.map((row) => ({ device: row.device, os: row.os, browser: row.browser, count: Number(row.count), lastAt: row.last_at })),
  };
}

async function summary(base) {
  const sql = (extra) => ["created_at >= NOW() - INTERVAL 7 DAY", ...base.where, ...extra].join(" AND ");
  const [[totals]] = await getPool().query(
    `SELECT COUNT(*) AS week,
            SUM(created_at >= NOW() - INTERVAL 1 DAY) AS today,
            COUNT(DISTINCT COALESCE(visitor_id, ip)) AS visitors
       FROM visits WHERE ${sql([])}`,
    base.args
  );
  const [countries] = await getPool().query(
    `SELECT country_code AS code, MAX(country) AS name, COUNT(*) AS count
       FROM visits WHERE ${sql(["country_code IS NOT NULL"])}
      GROUP BY country_code ORDER BY count DESC LIMIT 6`,
    base.args
  );
  return {
    today: Number(totals.today) || 0,
    week: Number(totals.week) || 0,
    visitorsWeek: Number(totals.visitors) || 0,
    countries: countries.map((row) => ({ code: row.code, name: row.name, count: Number(row.count) })),
  };
}

async function list({ site, q, user, before }) {
  const linked = await linking();
  const base = filters({ site, q, user }, linked);
  const where = [...base.where];
  const args = [...base.args];
  const cursor = Number(before);
  if (Number.isSafeInteger(cursor) && cursor > 0) {
    where.push("id < ?");
    args.push(cursor);
  }
  try {
    const [rows] = await getPool().query(
      `SELECT * FROM visits ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ${PAGE_SIZE + 1}`,
      args
    );
    const visits = rows.slice(0, PAGE_SIZE).map(toVisit);
    const members = linked ? await membersByIds([...new Set(visits.map((v) => v.accountId).filter(Boolean))]) : new Map();
    for (const visit of visits) visit.member = members.get(visit.accountId) || null;
    const filteringMember = linked && PUBLIC_ID.test(user || "");
    return {
      visits,
      next: rows.length > PAGE_SIZE ? visits.at(-1).id : null,
      linked,
      ...(before ? {} : { summary: await summary(base), ...(filteringMember ? { member: await memberSummary(user) } : {}) }),
    };
  } catch (err) {
    if (err.errno !== NO_TABLE) throw err;
    return { visits: [], next: null, summary: { today: 0, week: 0, visitorsWeek: 0, countries: [] }, waiting: true };
  }
}

module.exports = { list };
