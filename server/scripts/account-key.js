// Prints the account_key row id for an account number, e.g. to make that account Pro by hand. Needs the server's .env.
const { config } = require("../lib/config");
const { isAccountNumber, keyFor } = require("../lib/accounts");

const accountNumber = String(process.argv[2] || "").trim();
if (!config.accountPepper) {
  console.error("ACCOUNT_PEPPER is not set. Run this where the server's .env (or environment) is available.");
  process.exit(1);
}
if (!isAccountNumber(accountNumber)) {
  console.error("Usage: npm run account-key -- xxxx-xxxx-xxxx-xxxx");
  process.exit(1);
}
console.log(keyFor(accountNumber));
