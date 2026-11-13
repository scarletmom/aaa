// Copies workflows from one database to another, keeping their ids, so locked ones stay locked.
//   npm run workflows:copy -- --to DATABASE_URL_LIVE              the Reel to post workflows, .env's DATABASE_URL -> DATABASE_URL_LIVE
//   npm run workflows:copy -- --to DATABASE_URL_LIVE --dry-run    only shows what would change
//   npm run workflows:copy -- --to DATABASE_URL_LIVE --overwrite  also replaces ones that already exist there
//   npm run workflows:copy -- --to DATABASE_URL_LIVE --ids a,b    other workflows, by id
// --from and --to name variables in the env file (default .env, or --env <file>), never the URLs themselves.
const path = require("node:path");

function parseArgs(argv) {
  const args = { from: "DATABASE_URL", env: ".env", dryRun: false, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split("=");
    const value = () => inline ?? argv[++i];
    if (flag === "--to") args.to = value();
    else if (flag === "--from") args.from = value();
    else if (flag === "--env") args.env = value();
    else if (flag === "--ids") args.ids = value().split(",").map((id) => id.trim()).filter(Boolean);
    else if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--overwrite") args.overwrite = true;
    else throw new Error(`Unknown option ${argv[i]}`);
  }
  if (!args.to) throw new Error("Say where to copy to, e.g. --to DATABASE_URL_LIVE");
  if (args.to === args.from) throw new Error("--from and --to are the same variable");
  return args;
}

function describe(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "(unparseable URL)";
  }
}

// mysql2 warns about ssl-mode in the URL; TLS is set from MYSQL_CA_CERT instead.
function withoutSslMode(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete("ssl-mode");
  return parsed.toString();
}

const CREATE_WORKFLOWS = `
CREATE TABLE IF NOT EXISTS workflows (
  id          VARCHAR(32)   NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  slug        VARCHAR(64)   NOT NULL,
  is_active   TINYINT(1)    NOT NULL DEFAULT 0,
  definition  MEDIUMTEXT    NOT NULL,
  created_at  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_workflows_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.loadEnvFile(path.resolve(args.env));
  const fromUrl = process.env[args.from];
  const toUrl = process.env[args.to];
  if (!fromUrl) throw new Error(`${args.from} isn't set in ${args.env}`);
  if (!toUrl) throw new Error(`${args.to} isn't set in ${args.env}`);
  if (withoutSslMode(fromUrl) === withoutSslMode(toUrl)) throw new Error(`${args.from} and ${args.to} point at the same database`);

  const db = require("../lib/site/db");
  const { STEPS } = require("../lib/reels");
  const ids = args.ids || Object.values(STEPS).map((step) => step.id);

  console.log(`From: ${args.from} (${describe(fromUrl)})`);
  console.log(`To:   ${args.to} (${describe(toUrl)})${args.dryRun ? "   [dry run, nothing is written]" : ""}\n`);

  const source = db.poolFor(withoutSslMode(fromUrl));
  const target = db.poolFor(withoutSslMode(toUrl));
  try {
    const [rows] = await source.query("SELECT id, name, slug, is_active, definition, created_at FROM workflows WHERE id IN (?)", [ids]);
    const missing = ids.filter((id) => !rows.some((row) => row.id === id));
    if (missing.length) throw new Error(`Not found in ${args.from}: ${missing.join(", ")}`);

    if (!args.dryRun) await target.query(CREATE_WORKFLOWS);
    const [existing] = await target.query("SELECT id, slug FROM workflows").catch((err) => {
      if (args.dryRun && err.code === "ER_NO_SUCH_TABLE") return [[]];
      throw err;
    });

    const plan = rows.map((row) => {
      const sameId = existing.find((w) => w.id === row.id);
      const slugTaken = existing.find((w) => w.slug === row.slug && w.id !== row.id);
      return { row, action: slugTaken ? "slug-taken" : sameId ? (args.overwrite ? "replace" : "skip") : "create", slugTaken };
    });

    const blocked = plan.filter((p) => p.action === "slug-taken");
    if (blocked.length) {
      for (const p of blocked) console.log(`  blocked  ${p.row.name}: /hook/${p.row.slug} is used by another workflow (${p.slugTaken.id}) there`);
      throw new Error("Nothing was copied. Rename or remove the clashing workflows first.");
    }

    for (const { row, action } of plan) {
      const label = { create: "create ", replace: "replace", skip: "skip   " }[action];
      console.log(`  ${label}  ${row.name} (${row.id})${action === "skip" ? " already exists; add --overwrite to replace it" : ""}`);
    }

    const writes = plan.filter((p) => p.action !== "skip");
    if (args.dryRun || !writes.length) return console.log(`\n${writes.length} would be written.`);

    const connection = await target.getConnection();
    try {
      await connection.beginTransaction();
      for (const { row } of writes) {
        await connection.query(
          `INSERT INTO workflows (id, name, slug, is_active, definition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug), is_active = VALUES(is_active),
             definition = VALUES(definition), updated_at = VALUES(updated_at)`,
          [row.id, row.name, row.slug, row.is_active, row.definition, row.created_at, new Date()]
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
    console.log(`\n${writes.length} written. A running admin server picks them up on restart, or when the Reel to post page loads.`);
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(`workflows:copy failed: ${err.message}`);
  process.exit(1);
});
