const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { config } = require("./config");

const AUDIENCE = { pass: "videos-pass", gate: "news-gate", play: "news-play" };

function sign(audience, payload, ttlSeconds) {
  return jwt.sign(payload, config.jwtSecret, { algorithm: "HS256", audience, expiresIn: ttlSeconds });
}

function verify(audience, token) {
  if (typeof token !== "string" || !token) return null;
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"], audience });
  } catch {
    return null;
  }
}

const signPass = () => sign(AUDIENCE.pass, {}, config.passTtlSeconds);
const verifyPass = (token) => verify(AUDIENCE.pass, token);

// The news site decodes (but can't verify) this payload: fetchurl, step and pages drive its gate box.
function signGate(tag) {
  const fetchurl = new URL("api/gate", config.publicUrl).href;
  return sign(AUDIENCE.gate, { sub: tag, fetchurl, step: 1, pages: 1 }, config.gateTtlSeconds);
}

const verifyGate = (token) => verify(AUDIENCE.gate, token);
const signPlay = (tag) => sign(AUDIENCE.play, { sub: tag }, config.playTtlSeconds);
const verifyPlay = (token) => verify(AUDIENCE.play, token);

// Telegram's startapp parameter only allows [A-Za-z0-9_-], so no JWT dots: base64url payload
// followed by a fixed-length base64url signature.
const APP_SIG_LENGTH = 22;

function appSignature(payload) {
  return crypto.createHmac("sha256", `${config.jwtSecret}:telegram-app`).update(payload).digest().subarray(0, 16).toString("base64url");
}

function signApp(tag) {
  const payload = Buffer.from(JSON.stringify({ s: tag, e: Math.floor(Date.now() / 1000) + config.appTtlSeconds })).toString("base64url");
  return payload + appSignature(payload);
}

function verifyApp(token) {
  if (typeof token !== "string" || token.length <= APP_SIG_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const payload = token.slice(0, -APP_SIG_LENGTH);
  const expected = Buffer.from(appSignature(payload));
  const given = Buffer.from(token.slice(-APP_SIG_LENGTH));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { s, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof s === "string" && Number(e) * 1000 > Date.now() ? { sub: s } : null;
  } catch {
    return null;
  }
}

function bearer(req) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

module.exports = { signPass, verifyPass, signGate, verifyGate, signPlay, verifyPlay, signApp, verifyApp, bearer };
