const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const net = require("node:net");
const maxmind = require("maxmind");
const { config } = require("./config");

const EDITIONS = ["GeoLite2-City", "GeoLite2-ASN"];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const run = promisify(execFile);

const readers = {};
let refreshing = null;

const dbFile = (edition) => path.join(config.geoip.dir, `${edition}.mmdb`);

function isFresh(file) {
  try {
    return Date.now() - fs.statSync(file).mtimeMs < MAX_AGE_MS;
  } catch {
    return false;
  }
}

async function download(edition) {
  const { accountId, licenseKey, dir } = config.geoip;
  const auth = Buffer.from(`${accountId}:${licenseKey}`).toString("base64");
  const res = await fetch(`https://download.maxmind.com/geoip/databases/${edition}/download?suffix=tar.gz`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`${edition} download failed: HTTP ${res.status}`);

  // Streamed to disk and unpacked by tar so the ~40 MB archive never sits in memory.
  const work = fs.mkdtempSync(path.join(dir, `${edition}-`));
  try {
    const archive = path.join(work, "db.tar.gz");
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(archive));
    await run("tar", ["-xzf", archive, "-C", work]);
    const folder = fs.readdirSync(work).find((name) => name.startsWith(`${edition}_`));
    if (!folder) throw new Error(`${edition} archive has no database folder`);
    fs.renameSync(path.join(work, folder, `${edition}.mmdb`), dbFile(edition));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function refresh() {
  if (!config.geoip.licenseKey || !config.geoip.accountId) return;
  fs.mkdirSync(config.geoip.dir, { recursive: true });
  for (const edition of EDITIONS) {
    const file = dbFile(edition);
    try {
      if (!isFresh(file)) await download(edition);
    } catch (err) {
      console.error(`geoip: ${err.message}${fs.existsSync(file) ? " (keeping the old copy)" : ""}`);
    }
    if (fs.existsSync(file)) readers[edition] = await maxmind.open(file);
  }
}

function start() {
  if (!config.geoip.licenseKey || !config.geoip.accountId) {
    console.log("geoip:       off (set MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY)");
    return;
  }
  const update = () => {
    refreshing ||= refresh()
      .catch((err) => console.error(`geoip: ${err.message}`))
      .finally(() => {
        refreshing = null;
      });
  };
  update();
  setInterval(update, 24 * 60 * 60 * 1000).unref();
}

const normalizeIp = (ip) => String(ip || "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");

function lookup(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!net.isIP(ip)) return {};
  const city = readers["GeoLite2-City"]?.get(ip);
  const asn = readers["GeoLite2-ASN"]?.get(ip);
  return {
    countryCode: city?.country?.iso_code || city?.registered_country?.iso_code || null,
    country: city?.country?.names?.en || city?.registered_country?.names?.en || null,
    region: city?.subdivisions?.[0]?.names?.en || null,
    city: city?.city?.names?.en || null,
    postal: city?.postal?.code || null,
    latitude: city?.location?.latitude ?? null,
    longitude: city?.location?.longitude ?? null,
    accuracyKm: city?.location?.accuracy_radius ?? null,
    timezone: city?.location?.time_zone || null,
    asn: asn?.autonomous_system_number ?? null,
    isp: asn?.autonomous_system_organization || null,
  };
}

module.exports = { start, lookup, normalizeIp };
