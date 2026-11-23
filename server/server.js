const express = require("express");
const { config, assertReady } = require("./lib/config");
const db = require("./lib/db");
const videos = require("./lib/videos");
const tokens = require("./lib/tokens");
const news = require("./lib/news");
const { verifyCaptcha } = require("./lib/captcha");
const { playable } = require("./lib/workflows");
const telegram = require("./lib/telegram");
const geoip = require("./lib/geoip");
const visits = require("./lib/visits");
const accounts = require("./lib/accounts");
const pro = require("./lib/pro");
const adFree = require("./lib/adFree");
const sessions = require("./lib/sessions");

assertReady();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Dodo Payments signs the raw body, so this route reads it before the JSON parser below can.
app.post("/api/pro/webhook", express.raw({ type: "*/*", limit: "256kb" }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!pro.verifyWebhook(req.headers, raw)) return res.sendStatus(401);
  try {
    await pro.handleWebhook(JSON.parse(raw));
    res.sendStatus(204);
  } catch (err) {
    // A 5xx makes Dodo retry the delivery later.
    console.error(`pro webhook: ${err.message}`);
    res.sendStatus(500);
  }
});

app.use(express.json({ limit: "16kb" }));

// The videos site posts JSON and the news site sends the gate token in Authorization,
// so both origins need preflight answers.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", "no-store");
  next();
});

// Render sits behind Cloudflare, which puts the visitor's address in CF-Connecting-IP and
// overwrites any copy a client sends; req.ip would be a Cloudflare edge address.
const clientIp = (req) => geoip.normalizeIp(req.get("cf-connecting-ip") || req.ip);

function rateLimit({ windowMs, limit }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const ip = clientIp(req);
    const entry = hits.get(ip);
    if (!entry || entry.resetAt < now) {
      if (hits.size > 10000) hits.clear();
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count <= limit) return next();
    res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
  };
}

const captchaLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30 });
const gateLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60 });
const visitLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 120 });

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

async function requireCaptcha(req, res, next) {
  const response = typeof req.body?.captcha === "string" ? req.body.captcha : "";
  if (!response) return res.status(400).json({ error: "Please solve the captcha first." });
  if (!(await verifyCaptcha(response, clientIp(req)))) return res.status(403).json({ error: "Captcha check failed. Try again." });
  next();
}

const WATCHER_ROLES = new Set([accounts.ROLES.memberLite, accounts.ROLES.memberPro]);

/**
 * What an account token stands for: `{ claims, account, sessionId }` while its session is live. Otherwise `account` is
 * missing, and `ended` says why the session was ended, if it was.
 */
async function signedIn(token) {
  const claims = tokens.verifyAccount(token);
  if (!claims?.sessionId) return { claims };
  const session = await sessions.find(claims.sessionId);
  if (!session) return { claims };
  if (session.endedReason) return { claims, ended: session.endedReason };
  const account = await accounts.findByKey(session.accountKey);
  return account ? { claims, account, sessionId: claims.sessionId } : { claims };
}

function signedOut(res, ended) {
  if (ended === sessions.ENDED.deviceLimit) {
    const devices = config.maxDevices === 1 ? "one device" : `${config.maxDevices} devices`;
    return res.status(401).json({
      error: `You were signed out because this account signed in on another device. It can be signed in on ${devices} at once.`,
      code: "device_limit",
    });
  }
  return res.status(401).json({ error: "Please sign in again.", code: "session_expired" });
}

/** Sets req.account and req.sessionId from a live account token, or answers 401. */
async function requireSignedIn(req, res, next) {
  const { account, sessionId, ended } = await signedIn(tokens.bearer(req));
  if (!account) return signedOut(res, ended);
  req.account = account;
  req.sessionId = sessionId;
  next();
}

// The videos site sends a captcha pass; the blogsite sends a Member Lite or Pro account token, which is
// re-checked against the database so a role an admin took away stops working at once.
async function requireViewer(req, res, next) {
  const token = tokens.bearer(req);
  if (tokens.verifyPass(token)) return next();
  const { claims, account, ended } = await signedIn(token);
  if (!claims) return res.status(401).json({ error: "Verification required.", code: "pass_required" });
  if (!account) return signedOut(res, ended);
  if (!WATCHER_ROLES.has(account.role)) {
    return res.status(403).json({ error: "Videos are for Member Lite and Member Pro accounts.", code: "plan_required" });
  }
  req.member = account;
  next();
}

async function loadVideo(req, res, next) {
  const video = await videos.get(req.params.tag);
  if (!video) return res.status(404).json({ error: "This video doesn't exist or has been removed." });
  req.video = video;
  next();
}

function playEndpoint(tag) {
  const endpoint = new URL("api/play", config.publicUrl);
  endpoint.searchParams.set("token", tokens.signPlay(tag));
  return endpoint.href;
}

const watchUrl = (tag) => new URL(`r/${encodeURIComponent(tag)}`, config.videosSite).href;

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.get("/api/config", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ sitekey: config.turnstileSitekey, adFreeKey: adFree.publicKey() });
});

const siteByOrigin = new Map(
  [
    [config.videosSite, "videos"],
    [config.newsSite, "news"],
  ].map(([url, site]) => [new URL(url).origin, site])
);

// Page-view beacon from both sites. Sent as text/plain so the browser skips the CORS preflight.
app.post(
  "/api/visit",
  visitLimit,
  express.text({ type: "text/plain", limit: "4kb" }),
  wrap(async (req, res) => {
    const site = siteByOrigin.get(req.headers.origin);
    if (!site) return res.sendStatus(403);
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.sendStatus(400);
    }
    if (!body || typeof body !== "object") return res.sendStatus(400);
    await visits.record({ site, ip: clientIp(req), userAgent: req.get("user-agent"), body });
    res.sendStatus(204);
  })
);

// Step 1: the captcha in front of the video list.
app.post("/api/pass", captchaLimit, wrap(requireCaptcha), (req, res) => {
  res.json({ token: tokens.signPass(), expiresIn: config.passTtlSeconds });
});

// No account number here: it's the login, so it is sent once, when the account is made (see /api/register).
const sessionFor = (account, sessionId) => ({
  token: tokens.signAccount(sessionId),
  expiresIn: config.accountTtlSeconds,
  id: account.publicId,
  name: account.fullName,
  role: account.role,
  proUntil: account.proUntil ? new Date(account.proUntil).toISOString() : null,
  // The sites drop ads only for a valid pass; `role` alone is just for display.
  adFree: adFree.signPass(account),
});

// A captcha pass in Authorization makes the account Member Lite; without one it's a plain Member.
// A pass that is sent but invalid is rejected rather than quietly downgraded.
app.post(
  "/api/register",
  captchaLimit,
  wrap(requireCaptcha),
  wrap(async (req, res) => {
    const fullName = typeof req.body?.fullname === "string" ? req.body.fullname.trim().replace(/\s+/g, " ") : "";
    if (!fullName) return res.status(400).json({ error: "Please enter your full name." });
    if (fullName.length > 120) return res.status(400).json({ error: "Full name must be 120 characters or fewer." });

    const pass = tokens.bearer(req);
    if (pass && !tokens.verifyPass(pass)) {
      return res.status(401).json({ error: "Verification expired. Solve the captcha again.", code: "pass_required" });
    }
    const role = pass ? accounts.ROLES.memberLite : accounts.ROLES.member;
    const { account, accountNumber } = await accounts.create({ fullName, role });
    res.status(201).json({ ...sessionFor(account, await sessions.open(account.key)), accountNumber });
  })
);

app.post(
  "/api/login",
  captchaLimit,
  wrap(requireCaptcha),
  wrap(async (req, res) => {
    const account = await accounts.findByNumber(String(req.body?.accountNumber || "").trim());
    if (!account) return res.status(401).json({ error: "No account has that account number." });
    res.json(sessionFor(account, await sessions.open(account.key)));
  })
);

// The blogsite calls this on load: the role is re-read from the database (an admin may have changed it)
// and a fresh token is issued, so an active visitor stays signed in.
app.get(
  "/api/account",
  gateLimit,
  wrap(async (req, res) => {
    const { claims, account, sessionId, ended } = await signedIn(tokens.bearer(req));
    if (account) {
      await sessions.touch(sessionId);
      return res.json(sessionFor(account, sessionId));
    }
    // A token from before sessions is traded for one, which counts against the device limit like any sign-in.
    const legacy = claims?.accountNumber && (await accounts.findByNumber(claims.accountNumber));
    if (legacy) return res.json(sessionFor(legacy, await sessions.open(legacy.key)));
    signedOut(res, ended);
  })
);

app.post(
  "/api/logout",
  gateLimit,
  wrap(async (req, res) => {
    const { sessionId } = await signedIn(tokens.bearer(req));
    if (sessionId) await sessions.end(sessionId);
    res.sendStatus(204);
  })
);

// Revoking access needs the account number as well as a token, so a stolen token can't lock the owner out.
function requireAccountNumber(req, res, next) {
  if (!accounts.matchesNumber(req.account, req.body?.accountNumber)) {
    return res.status(403).json({ error: "That isn't this account's number.", code: "wrong_account_number" });
  }
  next();
}

// Signs out every other device; this one stays signed in.
app.post(
  "/api/account/sign-out-others",
  captchaLimit,
  wrap(requireSignedIn),
  requireAccountNumber,
  wrap(async (req, res) => {
    await sessions.endOthers(req.account.key, req.sessionId);
    res.json(sessionFor(req.account, req.sessionId));
  })
);

// For a leaked number: the old one stops working everywhere and the new one is sent once, like at registration.
app.post(
  "/api/account/new-number",
  captchaLimit,
  wrap(requireSignedIn),
  requireAccountNumber,
  wrap(async (req, res) => {
    const changed = await accounts.changeNumber(req.account.key);
    if (!changed) return res.status(401).json({ error: "Please sign in again.", code: "session_expired" });
    await sessions.endOthers(changed.account.key, req.sessionId);
    res.json({ ...sessionFor(changed.account, req.sessionId), accountNumber: changed.accountNumber });
  })
);

// Member Pro checkout: the buyer is sent to Dodo's page, which returns them to the blogsite's videos page.
app.post(
  "/api/pro/checkout",
  captchaLimit,
  wrap(requireSignedIn),
  wrap(async (req, res) => {
    const { account } = req;
    try {
      res.json({ url: await pro.createCheckout(account, String(req.body?.plan || "")) });
    } catch (err) {
      if (err instanceof pro.ProError) return res.status(err.status).json({ error: err.message, code: err.code });
      console.error(`pro checkout: ${err.message}`);
      res.status(502).json({ error: "The payment page couldn't be opened. Please try again in a moment." });
    }
  })
);

// Called by the videos page after Dodo sends the buyer back; Dodo's API decides, not the return URL.
app.post(
  "/api/pro/confirm",
  gateLimit,
  wrap(requireSignedIn),
  wrap(async (req, res) => {
    const { account } = req;
    try {
      res.json({ status: await pro.confirm(account, req.body?.ref || "") });
    } catch (err) {
      if (err instanceof pro.ProError) return res.status(err.status).json({ error: err.message, code: err.code });
      console.error(`pro confirm: ${err.message}`);
      res.status(502).json({ error: "Couldn't check the payment right now. Please try again in a moment." });
    }
  })
);

app.get(
  "/api/videos",
  wrap(requireViewer),
  wrap(async (req, res) => {
    res.json({ videos: (await videos.listEnabled()).map(videos.publicVideo) });
  })
);

app.get(
  "/api/videos/:tag",
  wrap(requireViewer),
  wrap(loadVideo),
  wrap(async (req, res) => {
    videos.addView(req.video.tag).catch((err) => console.error(`view count failed: ${err.message}`));
    const { same, others } = videos.related(req.video, await videos.listEnabled());
    res.json({
      video: videos.publicVideo(req.video),
      same: same.map(videos.publicVideo),
      others: others.map(videos.publicVideo),
      // Members skip the gate pages: the player can fetch this endpoint straight away.
      ...(req.member ? { play: playEndpoint(req.video.tag) } : {}),
    });
  })
);

// Step 2: captcha on the detail page, then off to a random news page carrying the gate token.
app.post(
  "/api/videos/:tag/unlock",
  captchaLimit,
  wrap(loadVideo),
  wrap(requireCaptcha),
  wrap(async (req, res) => {
    res.json({ next: await news.gatePageUrl(tokens.signGate(req.video.tag)) });
  })
);

// Step 3: the news page's "Click here to get link" calls this (the token's fetchurl).
app.get(
  "/api/gate",
  gateLimit,
  wrap(async (req, res) => {
    const gate = tokens.verifyGate(tokens.bearer(req));
    if (!gate) return res.status(401).json({ error: "This link has expired. Go back and request a new one." });
    if (Date.now() / 1000 - gate.iat < config.gateMinWaitSeconds) {
      return res.status(425).json({ error: "Please wait for the countdown to finish." });
    }
    if (!(await videos.get(gate.sub))) return res.status(404).json({ error: "This video has been removed." });

    res.json({ url: news.playerUrl(playEndpoint(gate.sub)) });
  })
);

// Step 4: the news player's endpoint. Only here is the real URL read and resolved.
app.get(
  "/api/play",
  wrap(async (req, res) => {
    const play = tokens.verifyPlay(String(req.query.token || ""));
    if (!play) return res.status(401).json({ error: "This player link has expired." });
    const video = await videos.get(play.sub);
    if (!video) return res.status(404).json({ error: "This video has been removed." });

    let media;
    try {
      media = await playable(video);
    } catch (err) {
      console.error(`play ${video.tag}: ${err.message}`);
      return res.status(502).json({ error: "The video host did not respond. Please try again in a moment." });
    }

    // A stream whose host refuses the news site can't play there; the player sends the visitor
    // to the Telegram Mini App instead, which opens it in the browser after an ad.
    const external = telegram.enabled() ? { url: telegram.appLink(video.tag) } : null;
    const blocked = Boolean(external && media.source && (await telegram.blocksNewsSite(media.source)));
    const source = { url: media.source, ...(media.qualities?.length ? { qualities: media.qualities } : {}) };
    const playback = media.embed ? { embed: media.embed } : blocked ? {} : { source };

    const { same, others } = videos.related(video, await videos.listEnabled());
    res.json({
      title: video.title,
      description: video.description,
      channel: video.category?.name || "",
      publishedAt: video.createdAt,
      poster: video.thumbnail,
      ...playback,
      ...(external ? { external } : {}),
      ...(media.episodes?.length ? { episodes: media.episodes } : {}),
      related: [...same, ...others].map((item) => ({
        title: item.title,
        href: watchUrl(item.tag),
        poster: item.thumbnail,
        channel: item.category?.name || "",
        ...(item.durationSeconds ? { duration: item.durationSeconds } : {}),
      })),
    });
  })
);

// Telegram Mini App: what to show before the ad, then the link to open after it.
function appVideo(req, res) {
  const app = tokens.verifyApp(String(req.body?.token ?? req.query.token ?? ""));
  if (!app) {
    res.status(401).json({ error: "This link has expired. Go back to the video and try again." });
    return null;
  }
  if (!telegram.validInitData(req.body?.initData ?? req.query.initData)) {
    res.status(403).json({ error: "Open this inside Telegram." });
    return null;
  }
  return app.sub;
}

app.get(
  "/api/app/video",
  wrap(async (req, res) => {
    const tag = appVideo(req, res);
    if (!tag) return;
    const video = await videos.get(tag);
    if (!video) return res.status(404).json({ error: "This video has been removed." });
    res.json({ title: video.title, poster: video.thumbnail, channel: video.category?.name || "", durationSeconds: video.durationSeconds });
  })
);

app.post(
  "/api/app/claim",
  gateLimit,
  wrap(async (req, res) => {
    const tag = appVideo(req, res);
    if (!tag) return;
    const video = await videos.get(tag);
    if (!video) return res.status(404).json({ error: "This video has been removed." });
    try {
      const media = await playable(video);
      res.json({ url: media.embed || media.source });
    } catch (err) {
      console.error(`app claim ${tag}: ${err.message}`);
      res.status(502).json({ error: "The video host did not respond. Please try again in a moment." });
    }
  })
);

// Links shared while this host served the site still work: /r/<tag> moves to the same path on the
// videos site, and any other page goes to its home. Temporary redirects so browsers don't pin them.
app.get("/r/:tag", (req, res) => res.redirect(302, watchUrl(req.params.tag)));
app.get(/^\/(?!api(\/|$)|healthz$)/, (req, res) => res.redirect(302, config.videosSite));

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Something went wrong." });
});

async function start() {
  await db.ping();
  await visits.start();
  await accounts.start();
  await pro.start();
  await sessions.start();
  geoip.start();
  const server = app.listen(config.port, () => {
    console.log(`videos server on http://localhost:${config.port}`);
    console.log(`videos site: ${config.videosSite}`);
    console.log(`news site:   ${config.newsSite}`);
    console.log(`telegram:    ${config.telegramAppUrl || "(off)"}`);
    console.log(`payments:    ${pro.enabled() ? `Dodo (${config.dodo.apiKey.startsWith("dodo_live_") ? "live" : "test"})` : "(off)"}`);
    console.log(`ad-free key: ${JSON.stringify(adFree.publicKey())}`);
    console.log(config.captchaDevBypass ? "captcha:     BYPASSED (CAPTCHA_DEV_BYPASS=true)" : `captcha:     live, sitekey ${config.turnstileSitekey}`);
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => server.close(() => db.close().finally(() => process.exit(0))));
  }
}

start().catch((err) => {
  console.error(`Startup failed: ${err.message}`);
  process.exit(1);
});
