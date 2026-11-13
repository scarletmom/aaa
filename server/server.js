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

assertReady();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
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

function requirePass(req, res, next) {
  if (tokens.verifyPass(tokens.bearer(req))) return next();
  res.status(401).json({ error: "Verification required.", code: "pass_required" });
}

async function loadVideo(req, res, next) {
  const video = await videos.get(req.params.tag);
  if (!video) return res.status(404).json({ error: "This video doesn't exist or has been removed." });
  req.video = video;
  next();
}

const watchUrl = (tag) => new URL(`r/${encodeURIComponent(tag)}`, config.videosSite).href;

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.get("/api/config", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ sitekey: config.turnstileSitekey });
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

app.get(
  "/api/videos",
  requirePass,
  wrap(async (req, res) => {
    res.json({ videos: (await videos.listEnabled()).map(videos.publicVideo) });
  })
);

// Detail pages stay open without a pass: they have their own captcha, and the player's
// "Up next" links land here.
app.get(
  "/api/videos/:tag",
  wrap(loadVideo),
  wrap(async (req, res) => {
    videos.addView(req.video.tag).catch((err) => console.error(`view count failed: ${err.message}`));
    const { same, others } = videos.related(req.video, await videos.listEnabled());
    res.json({
      video: videos.publicVideo(req.video),
      same: same.map(videos.publicVideo),
      others: others.map(videos.publicVideo),
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

    const endpoint = new URL("api/play", config.publicUrl);
    endpoint.searchParams.set("token", tokens.signPlay(gate.sub));
    res.json({ url: news.playerUrl(endpoint.href) });
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
      media = await playable(video.realUrl);
    } catch (err) {
      console.error(`play ${video.tag}: ${err.message}`);
      return res.status(502).json({ error: "The video host did not respond. Please try again in a moment." });
    }

    // A stream whose host refuses the news site can't play there; the player sends the visitor
    // to the Telegram Mini App instead, which opens it in the browser after an ad.
    const external = telegram.enabled() ? { url: telegram.appLink(video.tag) } : null;
    const blocked = Boolean(external && media.source && (await telegram.blocksNewsSite(media.source)));
    const playback = media.embed ? { embed: media.embed } : blocked ? {} : { source: { url: media.source } };

    const { same, others } = videos.related(video, await videos.listEnabled());
    res.json({
      title: video.title,
      description: video.description,
      channel: video.category?.name || "",
      publishedAt: video.createdAt,
      poster: video.thumbnail,
      ...playback,
      ...(external ? { external } : {}),
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
      const media = await playable(video.realUrl);
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
  geoip.start();
  const server = app.listen(config.port, () => {
    console.log(`videos server on http://localhost:${config.port}`);
    console.log(`videos site: ${config.videosSite}`);
    console.log(`news site:   ${config.newsSite}`);
    console.log(`telegram:    ${config.telegramAppUrl || "(off)"}`);
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
