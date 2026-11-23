const crypto = require("node:crypto");
const { config } = require("./config");
const { getPool } = require("./db");

const ROLES = { member: "member", memberLite: "member-lite", memberPro: "member-pro" };

// account_key is the account number's HMAC under ACCOUNT_PEPPER: the number is the login, so it is never stored.
const CREATE_ACCOUNTS = `
CREATE TABLE IF NOT EXISTS accounts (
  account_key     CHAR(64)     NOT NULL,
  full_name       VARCHAR(120) NOT NULL,
  role            VARCHAR(16)  NOT NULL,
  pro_until       DATETIME(3)  NULL,
  public_id       CHAR(64)     NULL,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const CREATE_SETTINGS = `
CREATE TABLE IF NOT EXISTS server_settings (
  name   VARCHAR(64)  NOT NULL,
  value  VARCHAR(255) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// New numbers are 64 random bits as xxxx-xxxx-xxxx-xxxx; older accounts still hold a UUID.
const ACCOUNT_NUMBER_PATTERN = /^(?:[0-9a-f]{4}(?:-[0-9a-f]{4}){3}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const isAccountNumber = (value) => typeof value === "string" && ACCOUNT_NUMBER_PATTERN.test(value);

const newAccountNumber = () => crypto.randomBytes(8).toString("hex").match(/.{4}/g).join("-");
// The non-secret id the sites know an account by (its own comments and likes, its ad-free pass); unrelated to the number.
const newPublicId = () => crypto.randomBytes(32).toString("hex");

/** What the database stores for an account number. Useless without ACCOUNT_PEPPER, which isn't in the database. */
const keyFor = (accountNumber) => crypto.createHmac("sha256", config.accountPepper).update(accountNumber.toLowerCase()).digest("hex");

/** Whether `accountNumber` is this account's number, compared in constant time. */
function matchesNumber(account, accountNumber) {
  if (!isAccountNumber(String(accountNumber || "").trim())) return false;
  return crypto.timingSafeEqual(Buffer.from(keyFor(String(accountNumber).trim()), "hex"), Buffer.from(account.key, "hex"));
}

async function columnExists(table, column) {
  const [rows] = await getPool().execute(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return rows.length > 0;
}

async function addColumn(definition) {
  await getPool()
    .query(`ALTER TABLE accounts ADD COLUMN ${definition}`)
    .catch((err) => {
      if (err.code !== "ER_DUP_FIELDNAME") throw err;
    });
}

// Keys made with another pepper would match no login, so a server with the wrong one must not run against this database.
async function checkPepper() {
  await getPool().query(CREATE_SETTINGS);
  const check = crypto.createHmac("sha256", config.accountPepper).update("account pepper check").digest("hex");
  await getPool().execute("INSERT IGNORE INTO server_settings (name, value) VALUES ('account_pepper_check', ?)", [check]);
  const [rows] = await getPool().execute("SELECT value FROM server_settings WHERE name = 'account_pepper_check'");
  if (rows[0].value !== check) {
    throw new Error("ACCOUNT_PEPPER doesn't match the one this database's accounts are keyed with. Set the original value.");
  }
}

// Plain account numbers have dashes; keys are 64 hex characters.
const PLAIN_NUMBER_SQL = "account_number LIKE '%-%'";

/** Tables from before keying hold plain numbers in account_number: key them all in one transaction, then rename. */
async function keyStoredNumbers() {
  const tables = [];
  for (const table of ["accounts", "pro_checkouts"]) if (await columnExists(table, "account_number")) tables.push(table);
  if (!tables.length) return;
  for (const table of tables) await getPool().query(`ALTER TABLE ${table} MODIFY account_number VARCHAR(64) NOT NULL`);

  const connection = await getPool().getConnection();
  let keyed = 0;
  try {
    await connection.beginTransaction();
    for (const table of tables) {
      const [rows] = await connection.query(`SELECT DISTINCT account_number FROM ${table} WHERE ${PLAIN_NUMBER_SQL} FOR UPDATE`);
      for (const { account_number: number } of rows) {
        if (table === "accounts") {
          // The old public_id was a plain hash of the number, so it is replaced too.
          await connection.execute("UPDATE accounts SET account_number = ?, public_id = ? WHERE account_number = ?", [keyFor(number), newPublicId(), number]);
          keyed += 1;
        } else {
          await connection.execute(`UPDATE ${table} SET account_number = ? WHERE account_number = ?`, [keyFor(number), number]);
        }
      }
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
  for (const table of tables) await getPool().query(`ALTER TABLE ${table} CHANGE account_number account_key CHAR(64) NOT NULL`);
  console.log(`accounts: stored ${keyed} account numbers as keys`);
}

async function start() {
  await checkPepper();
  await getPool().query(CREATE_ACCOUNTS);
  // Columns that older tables lack.
  await addColumn("pro_until DATETIME(3) NULL AFTER role");
  await addColumn("public_id CHAR(64) NULL AFTER pro_until");
  await keyStoredNumbers();
}

/** Makes an account; its number is returned this once and never stored. */
async function create({ fullName, role }) {
  const accountNumber = newAccountNumber();
  const key = keyFor(accountNumber);
  const publicId = newPublicId();
  await getPool().execute("INSERT INTO accounts (account_key, full_name, role, public_id) VALUES (?, ?, ?, ?)", [key, fullName, role, publicId]);
  return { account: { key, fullName, role, proUntil: null, publicId }, accountNumber };
}

const expired = (row) => row.role === ROLES.memberPro && row.pro_until && new Date(row.pro_until).getTime() <= Date.now();

const SELECT_ACCOUNT = "SELECT account_key, full_name, role, pro_until, public_id FROM accounts";

// A bought Pro pass ends at pro_until and falls back to Member Lite. Pro with no pro_until (lifetime,
// or set by an admin) never ends.
async function fromRow(row) {
  const account = {
    key: row.account_key,
    fullName: row.full_name,
    role: row.role,
    proUntil: row.pro_until || null,
    publicId: row.public_id,
  };
  if (expired(row)) {
    await getPool().execute(
      "UPDATE accounts SET role = ?, pro_until = NULL WHERE account_key = ? AND role = ? AND pro_until <= NOW(3)",
      [ROLES.memberLite, row.account_key, ROLES.memberPro]
    );
    return { ...account, role: ROLES.memberLite, proUntil: null };
  }
  return account;
}

async function findByKey(key) {
  if (typeof key !== "string" || !/^[0-9a-f]{64}$/.test(key)) return null;
  const [rows] = await getPool().execute(`${SELECT_ACCOUNT} WHERE account_key = ?`, [key]);
  return rows.length ? fromRow(rows[0]) : null;
}

/** The account a login number belongs to, or null. */
const findByNumber = (accountNumber) => (isAccountNumber(accountNumber) ? findByKey(keyFor(accountNumber)) : null);

/** Replaces a leaked account number: the old one stops logging in. The caller ends the other devices' sessions. */
async function changeNumber(key) {
  const accountNumber = newAccountNumber();
  const replacement = keyFor(accountNumber);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "UPDATE accounts SET account_key = ? WHERE account_key = ?",
      [replacement, key]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return null;
    }
    // Checkouts still waiting on Dodo must grant Pro to the account under its new key, and its sessions follow it.
    await connection.execute("UPDATE pro_checkouts SET account_key = ? WHERE account_key = ?", [replacement, key]);
    await connection.execute("UPDATE account_sessions SET account_key = ? WHERE account_key = ?", [replacement, key]);
    await connection.commit();
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
  return { account: await findByKey(replacement), accountNumber };
}

/** Coming from the videos site brings a plain Member up to Member Lite; higher roles are left alone. */
async function upgradeToLite(account) {
  if (account.role !== ROLES.member) return account;
  await getPool().execute("UPDATE accounts SET role = ? WHERE account_key = ? AND role = ?", [ROLES.memberLite, account.key, ROLES.member]);
  return findByKey(account.key);
}

/**
 * Makes the account Pro for `days` more days (added to any time it still has), or for good when `days` is null.
 * Pro that never ends is left alone. Runs inside the caller's transaction.
 */
async function grantPro(connection, key, days) {
  const [rows] = await connection.execute("SELECT role, pro_until FROM accounts WHERE account_key = ? FOR UPDATE", [key]);
  if (!rows.length) return false;
  const [row] = rows;
  if (row.role === ROLES.memberPro && !row.pro_until) return true;

  let proUntil = null;
  if (days !== null) {
    const stillPro = row.role === ROLES.memberPro && !expired(row);
    const from = stillPro ? new Date(row.pro_until).getTime() : Date.now();
    proUntil = new Date(from + days * 24 * 60 * 60 * 1000);
  }
  await connection.execute("UPDATE accounts SET role = ?, pro_until = ? WHERE account_key = ?", [ROLES.memberPro, proUntil, key]);
  return true;
}

module.exports = {
  ROLES,
  isAccountNumber,
  keyFor,
  matchesNumber,
  start,
  create,
  findByKey,
  findByNumber,
  changeNumber,
  upgradeToLite,
  grantPro,
};
