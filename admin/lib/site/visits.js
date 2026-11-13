const { getPool } = require("./db");

const PAGE_SIZE = 50;
const SITES = new Set(["videos", "news"]);
// The videos server creates the table on its first start; until then there's nothing to show.
const NO_TABLE = 1146;

function toVisit(row) {
  return {
    id: Number(row.id),
    at: row.created_at,
    site: row.site,
    path: row.path,
    referrer: row.referrer,
    visitorId: row.visitor_id,
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

function filters({ site, q }) {
  const where = [];
  const args = [];
  if (SITES.has(site)) {
    where.push("site = ?");
    args.push(site);
  }
  const query = String(q || "").trim().slice(0, 100);
  if (query) {
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(ip LIKE ? OR city LIKE ? OR region LIKE ? OR country LIKE ? OR isp LIKE ? OR path LIKE ?)");
    args.push(like, like, like, like, like, like);
  }
  return { where, args };
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

async function list({ site, q, before }) {
  const base = filters({ site, q });
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
    return {
      visits,
      next: rows.length > PAGE_SIZE ? visits.at(-1).id : null,
      ...(before ? {} : { summary: await summary(base) }),
    };
  } catch (err) {
    if (err.errno !== NO_TABLE) throw err;
    return { visits: [], next: null, summary: { today: 0, week: 0, visitorsWeek: 0, countries: [] }, waiting: true };
  }
}

module.exports = { list };
