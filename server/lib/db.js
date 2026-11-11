const mysql = require("mysql2/promise");
const { config } = require("./config");

let pool = null;

function sslOptions() {
  const { caCert, disableSsl } = config.database;
  if (disableSsl) return undefined;
  if (caCert) return { ca: caCert, rejectUnauthorized: true, minVersion: "TLSv1.2" };
  return { rejectUnauthorized: false, minVersion: "TLSv1.2" };
}

function getPool() {
  if (pool) return pool;
  const { url, host, port, user, password, name } = config.database;
  pool = mysql.createPool({
    ...(url ? { uri: url } : { host, port, user, password, database: name }),
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

async function ping() {
  const [rows] = await getPool().query("SELECT 1 AS ok");
  return rows[0].ok === 1;
}

async function close() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = { getPool, ping, close };
