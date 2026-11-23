const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { config } = require("./config");
const { ROLES } = require("./accounts");

// The sites only ever see the public half, so a pass found or edited in the browser can't be forged into one.
const AUDIENCE = "ad-free";
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

const base64url = (buffer) => Buffer.from(buffer).toString("base64url");

// Derived from JWT_SECRET so no extra secret has to be configured; changing JWT_SECRET changes the key.
function deriveKeys() {
  for (let counter = 0; ; counter += 1) {
    const d = Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, "", `quillwood ad-free ES256 ${counter}`, 32));
    const ecdh = crypto.createECDH("prime256v1");
    try {
      ecdh.setPrivateKey(d);
    } catch {
      continue; // d outside the curve's range: about 1 in 2^32
    }
    const point = ecdh.getPublicKey();
    const publicJwk = { kty: "EC", crv: "P-256", x: base64url(point.subarray(1, 33)), y: base64url(point.subarray(33)) };
    const privateKey = crypto.createPrivateKey({ key: { ...publicJwk, d: base64url(d) }, format: "jwk" });
    return { privateKey, publicJwk };
  }
}

let keys = null;
const getKeys = () => (keys ||= deriveKeys());

/** The public key (JWK) the sites check passes with; it goes in the blogsite's site.json as adFreeKey. */
const publicKey = () => getKeys().publicJwk;

/** A signed ad-free pass for a Member Pro account, or null for every other account. */
function signPass(account) {
  if (account.role !== ROLES.memberPro) return null;
  let ttl = MAX_TTL_SECONDS;
  if (account.proUntil) {
    ttl = Math.min(ttl, Math.floor((new Date(account.proUntil).getTime() - Date.now()) / 1000));
    if (ttl <= 0) return null;
  }
  return jwt.sign({ sub: account.publicId }, getKeys().privateKey, { algorithm: "ES256", audience: AUDIENCE, expiresIn: ttl });
}

module.exports = { publicKey, signPass };
