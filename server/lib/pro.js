const crypto = require("node:crypto");
const { config } = require("./config");
const { getPool } = require("./db");
const accounts = require("./accounts");

// Prices in cents for the one Pay What You Want product. Must match the blogsite's pricing.json.
const PLANS = {
  week: { amount: 50, days: 7 },
  month: { amount: 100, days: 30 },
  lifetime: { amount: 500, days: null },
};

const REQUEST_TIMEOUT_MS = 15000;
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

// Our record of each checkout. Dodo only ever sees `ref`, never the account number (the login secret).
const CREATE_CHECKOUTS = `
CREATE TABLE IF NOT EXISTS pro_checkouts (
  ref             CHAR(16)     NOT NULL,
  account_key     CHAR(64)     NOT NULL,
  plan            VARCHAR(16)  NOT NULL,
  amount          INT          NOT NULL,
  session_id      VARCHAR(64)  NULL,
  payment_id      VARCHAR(64)  NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at         DATETIME(3)  NULL,
  PRIMARY KEY (ref),
  UNIQUE KEY pro_checkouts_payment (payment_id),
  KEY pro_checkouts_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

class ProError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const enabled = () => Boolean(config.dodo.apiKey);
const apiBase = () => (config.dodo.apiKey.startsWith("dodo_live_") ? "https://live.dodopayments.com" : "https://test.dodopayments.com");

async function start() {
  await getPool().query(CREATE_CHECKOUTS);
}

async function dodo(path, { method = "GET", body } = {}) {
  const response = await fetch(apiBase() + path, {
    method,
    headers: {
      Authorization: `Bearer ${config.dodo.apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Dodo ${method} ${path} answered HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

/** Starts a Dodo checkout for `planId` and returns the page to send the buyer to. */
async function createCheckout(account, planId) {
  if (!enabled()) throw new ProError("Payments aren't open yet. Please try again soon.", 503, "payments_off");
  const plan = Object.hasOwn(PLANS, planId) ? PLANS[planId] : null;
  if (!plan) throw new ProError("Choose a plan first.", 400, "bad_plan");
  if (account.role === accounts.ROLES.memberPro && !account.proUntil) {
    throw new ProError("Your account already has Pro for good.", 409, "already_pro");
  }

  const ref = crypto.randomBytes(12).toString("base64url");
  await getPool().execute("INSERT INTO pro_checkouts (ref, account_key, plan, amount) VALUES (?, ?, ?, ?)", [
    ref,
    account.key,
    planId,
    plan.amount,
  ]);
  const session = await dodo("/checkouts", {
    method: "POST",
    body: {
      product_cart: [{ product_id: config.dodo.productId, quantity: 1, amount: plan.amount }],
      return_url: new URL(`videos/?pro=${ref}`, config.newsSite).href,
      metadata: { ref, plan: planId },
    },
  });
  if (!session.checkout_url) throw new Error("Dodo returned no checkout_url");
  await getPool().execute("UPDATE pro_checkouts SET session_id = ? WHERE ref = ?", [session.session_id || null, ref]);
  return session.checkout_url;
}

/** Standard Webhooks signature: HMAC-SHA256 over "id.timestamp.body" with the base64 secret after "whsec_". */
function verifyWebhook(headers, rawBody) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = String(headers["webhook-signature"] || "");
  if (!config.dodo.webhookSecret || !id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(config.dodo.webhookSecret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const given = Buffer.from(signature, "base64");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

// Dodo's statuses that end a payment without money taken.
const FAILED_STATUSES = new Set(["failed", "cancelled"]);

/** Dodo's own view of a checkout: its payment if one was made, read from the API rather than trusted from a URL or webhook. */
async function dodoPaymentFor(checkout) {
  if (!checkout.session_id) return null;
  const session = await dodo(`/checkouts/${encodeURIComponent(checkout.session_id)}`);
  return session.payment_id ? dodo(`/payments/${encodeURIComponent(session.payment_id)}`) : null;
}

// Adaptive pricing can charge the buyer in their own currency; the settlement amount is then in USD.
function usdCents(payment) {
  if (payment.currency === "USD") return Number(payment.total_amount);
  if (payment.settlement_currency === "USD") return Number(payment.settlement_amount);
  return null;
}

/**
 * Asks Dodo how the checkout `ref` went and grants its plan once it succeeded. Safe to call any number of times,
 * from the buyer's return or from the webhook. Resolves to "paid", "pending", "unpaid" (no payment made) or "failed".
 */
async function settle(ref) {
  const [rows] = await getPool().execute("SELECT * FROM pro_checkouts WHERE ref = ?", [ref]);
  const checkout = rows[0];
  if (!checkout) return "failed";
  if (checkout.status !== "pending") return checkout.status;

  // Ask Dodo before taking the row lock: never hold a lock across a network call.
  const payment = await dodoPaymentFor(checkout);
  if (!payment) return "unpaid";
  if (payment.metadata?.ref !== ref) return "failed";
  // Not stored: the buyer can retry a declined card on the same checkout.
  if (FAILED_STATUSES.has(payment.status)) return "failed";
  if (payment.status !== "succeeded") return "pending";
  const paid = usdCents(payment);
  if (paid === null) {
    console.error(`pro: payment ${payment.payment_id} settled in ${payment.settlement_currency}, not USD; not granted`);
    return "pending";
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [locked] = await connection.execute("SELECT account_key, plan, status FROM pro_checkouts WHERE ref = ? FOR UPDATE", [ref]);
    if (locked[0].status !== "pending") {
      await connection.rollback();
      return locked[0].status;
    }
    await accounts.grantPro(connection, locked[0].account_key, PLANS[locked[0].plan]?.days ?? null);
    await connection.execute("UPDATE pro_checkouts SET status = 'paid', payment_id = ?, paid_at = NOW(3) WHERE ref = ?", [
      payment.payment_id,
      ref,
    ]);
    await connection.commit();
    console.log(`pro: ${locked[0].plan} granted for checkout ${ref} (${paid}¢ USD)`);
    return "paid";
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

/** The buyer's own check after returning from Dodo; only the account that started the checkout may ask. */
async function confirm(account, ref) {
  if (!enabled()) throw new ProError("Payments aren't open yet. Please try again soon.", 503, "payments_off");
  const [rows] = await getPool().execute("SELECT account_key FROM pro_checkouts WHERE ref = ?", [String(ref)]);
  if (!rows.length || rows[0].account_key !== account.key) {
    throw new ProError("That checkout wasn't found.", 404, "checkout_not_found");
  }
  return settle(String(ref));
}

// Payments from the business's other products reach this webhook too; they carry no ref of ours.
async function handleWebhook(event) {
  if (!String(event?.type || "").startsWith("payment.")) return;
  const ref = event.data?.metadata?.ref;
  if (typeof ref === "string" && ref) await settle(ref);
}

module.exports = { PLANS, ProError, enabled, start, createCheckout, confirm, verifyWebhook, handleWebhook };
