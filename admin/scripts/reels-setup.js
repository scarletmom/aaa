// Creates the Reel to post workflows in the database that the given env file points at.
//   npm run reels:setup                          uses .env
//   npm run reels:setup -- --env .env.production uses another env file, e.g. production's
// Existing workflows are left as they are, so running it again is safe.
const path = require("node:path");

function envFileArg(argv) {
  const index = argv.findIndex((arg) => arg === "--env" || arg.startsWith("--env="));
  if (index === -1) return ".env";
  const value = argv[index].includes("=") ? argv[index].split("=").slice(1).join("=") : argv[index + 1];
  if (!value) throw new Error("--env needs a file, e.g. --env .env.production");
  return value;
}

async function main() {
  const envFile = path.resolve(envFileArg(process.argv.slice(2)));
  try {
    process.loadEnvFile(envFile);
  } catch (err) {
    throw new Error(`Couldn't read ${envFile}: ${err.message}`);
  }

  // Required after loading the env file, because these read the database settings when loaded.
  const db = require("../lib/site/db");
  const store = require("../lib/store");
  const { ensureReelWorkflows } = require("../lib/reels");

  const target = db.configured ? describeDatabase() : `files in ${path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"), "workflows")}`;
  console.log(`Env file: ${envFile}`);
  console.log(`Target:   ${target}\n`);

  try {
    await store.init();
    const { created, existing } = await ensureReelWorkflows(store);
    for (const name of created) console.log(`  created  ${name}`);
    for (const name of existing) console.log(`  exists   ${name} (left unchanged)`);
    console.log(`\n${created.length} created, ${existing.length} already there.`);
  } finally {
    if (db.configured) await db.getPool().end();
  }
}

// Host and database name only, never the credentials.
function describeDatabase() {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return `MySQL ${url.hostname}${url.pathname}`;
    } catch {
      return "MySQL (DATABASE_URL)";
    }
  }
  return `MySQL ${process.env.MYSQL_HOST}/${process.env.MYSQL_DATABASE}`;
}

main().catch((err) => {
  console.error(`reels:setup failed: ${err.message}`);
  process.exit(1);
});
