const mysql = require("mysql2/promise");

// Same variables as link-gate's server, so its .env lines can be copied over unchanged.
function parseCaCert(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes("BEGIN CERTIFICATE")) return value.replace(/\\n/g, "\n");
  return Buffer.from(value, "base64").toString("utf8");
}

const settings = {
  url: process.env.DATABASE_URL || "",
  host: process.env.MYSQL_HOST || "",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "",
  password: process.env.MYSQL_PASSWORD || "",
  name: process.env.MYSQL_DATABASE || "",
  caCert: parseCaCert(process.env.MYSQL_CA_CERT),
  disableSsl: process.env.MYSQL_SSL === "false",
};

const configured = Boolean(settings.url || (settings.host && settings.user && settings.name));

function sslOptions() {
  if (settings.disableSsl) return undefined;
  if (settings.caCert) return { ca: settings.caCert, rejectUnauthorized: true, minVersion: "TLSv1.2" };
  return { rejectUnauthorized: false, minVersion: "TLSv1.2" };
}

let pool = null;

function getPool() {
  if (pool) return pool;
  const base = settings.url
    ? { uri: settings.url }
    : { host: settings.host, port: settings.port, user: settings.user, password: settings.password, database: settings.name };

  pool = mysql.createPool({
    ...base,
    ssl: sslOptions(),
    waitForConnections: true,
    connectTimeout: 5000,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60000,
    enableKeepAlive: true,
    charset: "utf8mb4_general_ci",
    timezone: "Z",
  });
  return pool;
}

async function transaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { configured, getPool, transaction };
