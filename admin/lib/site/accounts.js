// Members of the blogsite and videos site. The videos server owns the `accounts` table; Studio reads it and
// changes only role and pro_until, the same two columns the server's Pro checkout writes.
const crypto = require("node:crypto");
const { getPool } = require("./db");

const ROLES = ["member", "member-lite", "member-pro"];
const PAGE_SIZE = 50;
const NO_TABLE = 1146;
const ACCOUNT_NUMBER_PATTERN = /^(?:[0-9a-f]{4}(?:-[0-9a-f]{4}){3}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const KEY_PATTERN = /^[0-9a-f]{64}$/;

class AccountError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Only with the server's ACCOUNT_PEPPER can a login number be turned into the key the table stores.
const pepper = () => String(process.env.ACCOUNT_PEPPER || "").trim();
const keyFor = (accountNumber) => crypto.createHmac("sha256", pepper()).update(accountNumber.toLowerCase()).digest("hex");

// A bought Pro pass that has ended counts as Member Lite; the server rewrites the row the next time the member signs in.
const PRO_LIVE = "(a.pro_until IS NULL OR a.pro_until > NOW(3))";
const ROLE_SQL = {
  member: "a.role = 'member'",
  "member-lite": `(a.role = 'member-lite' OR (a.role = 'member-pro' AND NOT ${PRO_LIVE}))`,
  "member-pro": `(a.role = 'member-pro' AND ${PRO_LIVE})`,
};

function effectiveRole(row) {
  if (row.role !== "member-pro") return ROLES.includes(row.role) ? row.role : "member";
  return row.pro_until && new Date(row.pro_until).getTime() <= Date.now() ? "member-lite" : "member-pro";
}

function toAccount(row) {
  const role = effectiveRole(row);
  return {
    key: row.account_key,
    name: row.full_name,
    role,
    proUntil: role === "member-pro" && row.pro_until ? new Date(row.pro_until).toISOString() : null,
    proEnded: row.role === "member-pro" && role !== "member-pro" ? new Date(row.pro_until).toISOString() : null,
    publicId: row.public_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || null,
    devices: Number(row.devices) || 0,
    paidCheckouts: Number(row.paid_checkouts) || 0,
    lastPlace: row.last_visit_at ? { city: row.last_city, country: row.last_country, code: row.last_country_code, at: row.last_visit_at } : null,
  };
}

function filters({ q, role }) {
  const where = [];
  const args = [];
  if (ROLE_SQL[role]) where.push(ROLE_SQL[role]);
  const query = String(q || "").trim().slice(0, 120);
  if (query) {
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const exact = [];
    if (ACCOUNT_NUMBER_PATTERN.test(query) && pepper()) exact.push(keyFor(query));
    if (KEY_PATTERN.test(query)) exact.push(query.toLowerCase());
    where.push(`(a.full_name LIKE ?${exact.length ? " OR a.account_key IN (?) OR a.public_id IN (?)" : ""})`);
    args.push(like, ...(exact.length ? [exact, exact] : []));
  }
  return { where, args };
}

const whereSql = (where) => (where.length ? `WHERE ${where.join(" AND ")}` : "");

// Sessions, checkouts and visits are the server's tables too; a server that hasn't made them (or visits.account_id) yet
// just shows nothing for them.
async function optionalTables() {
  const [rows] = await getPool().query(
    `SELECT DISTINCT IF(TABLE_NAME = 'visits', 'visits.account_id', TABLE_NAME) AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (TABLE_NAME IN ('account_sessions', 'pro_checkouts') OR (TABLE_NAME = 'visits' AND COLUMN_NAME = 'account_id'))`
  );
  return new Set(rows.map((row) => row.name));
}

// A device counts as signed in for 30 days after it was last seen, the server's account token lifetime.
async function selectAccounts(where, args, tail) {
  const tables = await optionalTables();
  const sessions = tables.has("account_sessions")
    ? `LEFT JOIN (SELECT account_key, MAX(last_seen_at) AS last_seen_at, SUM(ended_reason IS NULL AND last_seen_at > NOW(3) - INTERVAL 30 DAY) AS devices
         FROM account_sessions GROUP BY account_key) s ON s.account_key = a.account_key`
    : "";
  const checkouts = tables.has("pro_checkouts")
    ? `LEFT JOIN (SELECT account_key, COUNT(*) AS paid_checkouts FROM pro_checkouts WHERE status = 'paid' GROUP BY account_key) c
         ON c.account_key = a.account_key`
    : "";
  // The member's latest signed-in visit, found through the (account_id, created_at) index.
  const lastVisit = tables.has("visits.account_id")
    ? "LEFT JOIN visits v ON v.id = (SELECT MAX(id) FROM visits WHERE account_id = a.public_id)"
    : "";
  const [rows] = await getPool().query(
    `SELECT a.account_key, a.full_name, a.role, a.pro_until, a.public_id, a.created_at
            ${sessions ? ", s.last_seen_at, s.devices" : ""}${checkouts ? ", c.paid_checkouts" : ""}
            ${lastVisit ? ", v.city AS last_city, v.country AS last_country, v.country_code AS last_country_code, v.created_at AS last_visit_at" : ""}
       FROM accounts a ${sessions} ${checkouts} ${lastVisit} ${whereSql(where)} ${tail}`,
    args
  );
  return rows;
}

async function counts() {
  const [[row]] = await getPool().query(
    `SELECT COUNT(*) AS total, ${ROLES.map((role) => `SUM(${ROLE_SQL[role]}) AS \`${role}\``).join(", ")},
            SUM(a.created_at >= NOW(3) - INTERVAL 7 DAY) AS week
       FROM accounts a`
  );
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value) || 0]));
}

async function list({ q, role, offset }) {
  const { where, args } = filters({ q, role });
  const start = Math.max(Number.parseInt(offset, 10) || 0, 0);
  try {
    const rows = await selectAccounts(where, args, `ORDER BY a.created_at DESC, a.account_key LIMIT ${PAGE_SIZE + 1} OFFSET ${start}`);
    const accounts = rows.slice(0, PAGE_SIZE).map(toAccount);
    return {
      accounts,
      next: rows.length > PAGE_SIZE ? start + PAGE_SIZE : null,
      ...(start ? {} : { counts: await counts() }),
      numberSearch: Boolean(pepper()),
    };
  } catch (err) {
    if (err.errno !== NO_TABLE) throw err;
    return { accounts: [], next: null, counts: { total: 0, member: 0, "member-lite": 0, "member-pro": 0, week: 0 }, waiting: true };
  }
}

async function get(key) {
  if (!KEY_PATTERN.test(String(key))) return null;
  const rows = await selectAccounts(["a.account_key = ?"], [key], "");
  return rows[0] ? toAccount(rows[0]) : null;
}

function planInput(body) {
  const role = body?.role;
  if (!ROLES.includes(role)) throw new AccountError("role must be member, member-lite or member-pro");
  if (role !== "member-pro" || body.proUntil === null || body.proUntil === undefined || body.proUntil === "") return { role, proUntil: null };
  const proUntil = new Date(body.proUntil);
  if (Number.isNaN(proUntil.getTime())) throw new AccountError("proUntil must be a date");
  if (proUntil.getTime() <= Date.now()) throw new AccountError("The Pro end date must be in the future");
  return { role, proUntil };
}

/** Sets the plan; the member's next page load picks it up, as it does after a Pro purchase. */
async function setPlan(key, body) {
  const { role, proUntil } = planInput(body);
  if (!KEY_PATTERN.test(String(key))) throw new AccountError("Member not found", 404);
  const [result] = await getPool().execute("UPDATE accounts SET role = ?, pro_until = ? WHERE account_key = ?", [role, proUntil, key]);
  if (!result.affectedRows) throw new AccountError("Member not found", 404);
  return get(key);
}

module.exports = { AccountError, list, get, setPlan };
