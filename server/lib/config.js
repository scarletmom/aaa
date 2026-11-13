const path = require("node:path");

const isProduction = process.env.NODE_ENV === "production";

function origin(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

// Keeps the path so a site hosted under a folder (https://host/news/) still works; always ends in "/".
function baseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return `${url.origin}${url.pathname.replace(/\/?$/, "/")}`;
  } catch {
    return "";
  }
}

// A Mini App direct link, e.g. https://t.me/MyBot/watch; the video token is added as ?startapp=.
function telegramAppUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? `${url.origin}${url.pathname}` : "";
  } catch {
    return "";
  }
}

function parseCaCert(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes("BEGIN CERTIFICATE")) return value.replace(/\\n/g, "\n");
  return Buffer.from(value, "base64").toString("utf8");
}

const database = {
  url: process.env.DATABASE_URL || "",
  host: process.env.MYSQL_HOST || "",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "",
  password: process.env.MYSQL_PASSWORD || "",
  name: process.env.MYSQL_DATABASE || "",
  caCert: parseCaCert(process.env.MYSQL_CA_CERT),
  disableSsl: process.env.MYSQL_SSL === "false",
};
database.configured = Boolean(database.url || (database.host && database.user && database.name));

const minWait = Number(process.env.GATE_MIN_WAIT_SECONDS);

const config = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || "",
  turnstileSecret: process.env.TURNSTILE_SECRET || "",
  turnstileSitekey: process.env.TURNSTILE_SITEKEY || "",
  captchaDevBypass: !isProduction && process.env.CAPTCHA_DEV_BYPASS === "true",
  publicUrl: baseUrl(process.env.PUBLIC_URL) || `http://localhost:${Number(process.env.PORT) || 3000}/`,
  videosSite: baseUrl(process.env.VIDEOS_SITE_URL),
  newsSite: baseUrl(process.env.NEWS_SITE_URL),
  gateMinWaitSeconds: Number.isFinite(minWait) && minWait >= 0 ? minWait : 10,
  passTtlSeconds: 12 * 60 * 60,
  gateTtlSeconds: 15 * 60,
  playTtlSeconds: 3 * 60 * 60,
  appTtlSeconds: 60 * 60,
  telegramAppUrl: telegramAppUrl(process.env.TELEGRAM_APP_URL),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  geoip: {
    accountId: (process.env.MAXMIND_ACCOUNT_ID || "").trim(),
    licenseKey: (process.env.MAXMIND_LICENSE_KEY || "").trim(),
    dir: process.env.GEOIP_DIR || path.join(__dirname, "..", "data", "geoip"),
  },
  visitRetentionDays: Number(process.env.VISIT_RETENTION_DAYS) > 0 ? Number(process.env.VISIT_RETENTION_DAYS) : 90,
  database,
};

config.allowedOrigins = [origin(config.videosSite), origin(config.newsSite)].filter(Boolean);

function assertReady() {
  const missing = [];
  if (!config.jwtSecret) missing.push("JWT_SECRET");
  if (!config.captchaDevBypass && !config.turnstileSecret) missing.push("TURNSTILE_SECRET");
  if (!config.turnstileSitekey) missing.push("TURNSTILE_SITEKEY");
  if (!database.configured) missing.push("DATABASE_URL (or MYSQL_HOST + MYSQL_USER + MYSQL_DATABASE)");
  if (!config.videosSite) missing.push("VIDEOS_SITE_URL");
  if (!config.newsSite) missing.push("NEWS_SITE_URL");
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (isProduction && config.jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters in production");
}

module.exports = { config, assertReady };
