// Prints the public key for the blogsite's src/data/site.json (adFreeKey). Run with the server's real .env.
const { config } = require("../lib/config");

if (!config.jwtSecret) {
  console.error("JWT_SECRET is not set. Run this where the server's .env (or environment) is available.");
  process.exit(1);
}
console.log(JSON.stringify(require("../lib/adFree").publicKey()));
