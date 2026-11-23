const crypto = require("node:crypto");
const { config } = require("./config");
const { getPool } = require("./db");

// One row per signed-in device. Account tokens carry only the row's id, so ending the row signs that device out.
// Ended rows stay (with the reason) until their last token has expired, so the device can be told why.
const CREATE_SESSIONS = `
CREATE TABLE IF NOT EXISTS account_sessions (
  id            CHAR(32)     NOT NULL,
  account_key   CHAR(64)     NOT NULL,
  ended_reason  VARCHAR(16)  NULL,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY account_sessions_account (account_key, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const ENDED = { deviceLimit: "device_limit", signedOut: "signed_out" };

// A session unseen for this long holds only expired tokens: the blogsite renews the token whenever it touches the session.
const LIVE_SQL = "ended_reason IS NULL AND last_seen_at > NOW(3) - INTERVAL ? SECOND";

async function start() {
  await getPool().query(CREATE_SESSIONS);
  await getPool().execute("DELETE FROM account_sessions WHERE last_seen_at < NOW(3) - INTERVAL ? SECOND", [config.accountTtlSeconds]);
}

/**
 * Signs a device in and returns its session id. Past the device limit, the sessions used least recently are ended;
 * signing in always works, so whoever has the account number can't be locked out.
 */
async function open(accountKey) {
  const id = crypto.randomBytes(16).toString("hex");
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // Locks the account so two sign-ins at the same moment can't both fit under the limit.
    await connection.execute("SELECT 1 FROM accounts WHERE account_key = ? FOR UPDATE", [accountKey]);
    await connection.execute("INSERT INTO account_sessions (id, account_key) VALUES (?, ?)", [id, accountKey]);
    const [live] = await connection.execute(
      `SELECT id FROM account_sessions WHERE account_key = ? AND ${LIVE_SQL} ORDER BY last_seen_at DESC, created_at DESC`,
      [accountKey, config.accountTtlSeconds]
    );
    const others = live.map((row) => row.id).filter((liveId) => liveId !== id);
    const ended = others.slice(Math.max(0, config.maxDevices - 1));
    if (ended.length) {
      await connection.query("UPDATE account_sessions SET ended_reason = ? WHERE id IN (?)", [ENDED.deviceLimit, ended]);
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
  return id;
}

/** `{ accountKey, endedReason }` for a session id, or null when there's no such session (or it was cleared away). */
async function find(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id)) return null;
  const [rows] = await getPool().execute(
    `SELECT account_key, ended_reason, last_seen_at > NOW(3) - INTERVAL ? SECOND AS recent FROM account_sessions WHERE id = ?`,
    [config.accountTtlSeconds, id]
  );
  if (!rows.length || !rows[0].recent) return null;
  return { accountKey: rows[0].account_key, endedReason: rows[0].ended_reason };
}

/** Marks the session used now, which keeps it from being the one ended at the next sign-in elsewhere. */
async function touch(id) {
  await getPool().execute("UPDATE account_sessions SET last_seen_at = NOW(3) WHERE id = ? AND ended_reason IS NULL", [id]);
}

async function end(id) {
  await getPool().execute("UPDATE account_sessions SET ended_reason = ? WHERE id = ? AND ended_reason IS NULL", [ENDED.signedOut, id]);
}

async function endOthers(accountKey, keepId) {
  await getPool().execute(
    "UPDATE account_sessions SET ended_reason = ? WHERE account_key = ? AND id <> ? AND ended_reason IS NULL",
    [ENDED.signedOut, accountKey, keepId]
  );
}

module.exports = { ENDED, start, open, find, touch, end, endOthers };
