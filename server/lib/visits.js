const { getPool } = require("./db");
const { config } = require("./config");
const geoip = require("./geoip");

const CREATE_VISITS = `
CREATE TABLE IF NOT EXISTS visits (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  site             VARCHAR(16)     NOT NULL,
  path             VARCHAR(512)    NULL,
  referrer         VARCHAR(512)    NULL,
  visitor_id       VARCHAR(32)     NULL,
  ip               VARCHAR(45)     NOT NULL,
  country_code     CHAR(2)         NULL,
  country          VARCHAR(80)     NULL,
  region           VARCHAR(120)    NULL,
  city             VARCHAR(120)    NULL,
  postal           VARCHAR(20)     NULL,
  latitude         DECIMAL(8,5)    NULL,
  longitude        DECIMAL(8,5)    NULL,
  accuracy_km      SMALLINT UNSIGNED NULL,
  timezone         VARCHAR(64)     NULL,
  asn              INT UNSIGNED    NULL,
  isp              VARCHAR(255)    NULL,
  connection_type  VARCHAR(16)     NULL,
  downlink_mbps    DECIMAL(6,2)    NULL,
  rtt_ms           SMALLINT UNSIGNED NULL,
  device           VARCHAR(16)     NULL,
  os               VARCHAR(40)     NULL,
  browser          VARCHAR(40)     NULL,
  user_agent       VARCHAR(512)    NULL,
  language         VARCHAR(35)     NULL,
  screen           VARCHAR(20)     NULL,
  client_timezone  VARCHAR(64)     NULL,
  PRIMARY KEY (id),
  KEY idx_visits_created (created_at),
  KEY idx_visits_site_created (site, created_at),
  KEY idx_visits_ip (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const str = (value, max) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
};
const num = (value, min, max) => (Number.isFinite(value) && value >= min && value <= max ? value : null);

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
const BROWSERS = [
  [/Edg(?:e|A|iOS)?\/([\d]+)/, "Edge"],
  [/(?:OPR|Opera)\/([\d]+)/, "Opera"],
  [/SamsungBrowser\/([\d]+)/, "Samsung Internet"],
  [/UCBrowser\/([\d]+)/, "UC Browser"],
  [/YaBrowser\/([\d]+)/, "Yandex"],
  [/(?:Firefox|FxiOS)\/([\d]+)/, "Firefox"],
  [/(?:Chrome|CriOS)\/([\d]+)/, "Chrome"],
  [/Version\/([\d]+).*Safari\//, "Safari"],
];
const SYSTEMS = [
  [/Windows/, "Windows"],
  [/Android ([\d]+)/, "Android"],
  [/(?:iPhone|iPod) OS ([\d]+)/, "iOS"],
  [/iPad.*OS ([\d]+)/, "iPadOS"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

function parseUserAgent(ua) {
  const match = (list) => {
    for (const [pattern, name] of list) {
      const found = pattern.exec(ua);
      if (found) return found[1] ? `${name} ${found[1]}` : name;
    }
    return null;
  };
  let device = "desktop";
  if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(ua)) device = "bot";
  else if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) device = "tablet";
  else if (/Mobi|iPhone|Android/i.test(ua)) device = "mobile";
  return { device, os: match(SYSTEMS), browser: match(BROWSERS) };
}

async function ensureTable() {
  await getPool().query(CREATE_VISITS);
}

async function record({ site, ip, userAgent, body }) {
  const geo = geoip.lookup(ip);
  const ua = parseUserAgent(userAgent || "");
  const connection = body.connection && typeof body.connection === "object" ? body.connection : {};
  const row = {
    site,
    path: str(body.path, 512),
    referrer: str(body.referrer, 512),
    visitor_id: /^[a-z0-9]{8,32}$/i.test(body.visitorId || "") ? body.visitorId : null,
    ip,
    country_code: geo.countryCode,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    postal: geo.postal,
    latitude: geo.latitude,
    longitude: geo.longitude,
    accuracy_km: geo.accuracyKm,
    timezone: geo.timezone,
    asn: geo.asn,
    isp: geo.isp,
    connection_type: str(connection.effectiveType, 16),
    downlink_mbps: num(connection.downlink, 0, 9999),
    rtt_ms: num(connection.rtt, 0, 65535),
    device: ua.device,
    os: ua.os,
    browser: ua.browser,
    user_agent: str(userAgent, 512),
    language: str(body.language, 35),
    screen: /^\d{2,5}x\d{2,5}$/.test(body.screen || "") ? body.screen : null,
    client_timezone: str(body.timezone, 64),
  };
  await getPool().query("INSERT INTO visits SET ?", [row]);
}

async function purge() {
  await getPool().query("DELETE FROM visits WHERE created_at < NOW() - INTERVAL ? DAY", [config.visitRetentionDays]);
}

async function start() {
  await ensureTable();
  const clean = () => purge().catch((err) => console.error(`visit purge failed: ${err.message}`));
  clean();
  setInterval(clean, 24 * 60 * 60 * 1000).unref();
}

module.exports = { start, record, parseUserAgent };
