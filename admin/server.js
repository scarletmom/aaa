const path = require("node:path");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const express = require("express");
const store = require("./lib/store");
const {
  runWorkflow,
  runSingleStep,
  StepUnavailable,
  inputNode,
  inputSettings,
  configure: configureEngine,
} = require("./lib/engine");
const { publicTypes, responseValue } = require("./lib/nodes");
const { seedWorkflows } = require("./lib/seed");
const siteRoutes = require("./lib/site/routes");
const { run, forgetCache, resolveUrl } = require("./lib/resolver");
const { MEDIA_DIR } = require("./lib/storage");
const { usedFor, usageOf, deliveryProblems } = require("./lib/usage");
const { MAX_FILE_BYTES, mimeFromName } = require("./lib/files");
const reels = require("./lib/reels");
const variables = require("./lib/variables");

const PORT = Number(process.env.PORT) || 5678;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const API_TOKEN = process.env.API_TOKEN || "";
const SITE_NAME = process.env.SITE_NAME || "My website";
const SESSION_COOKIE = "linkproxy_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 10;

if (!ADMIN_PASSWORD) {
  console.error(
    "ADMIN_PASSWORD is not set. Add it to .env (see .env.example) so the editor and API are protected.",
  );
  process.exit(1);
}

// Derived from the password, so changing ADMIN_PASSWORD signs everyone out.
const SESSION_KEY = crypto
  .createHash("sha256")
  .update(`linkproxy-session:${ADMIN_PASSWORD}`)
  .digest();

const app = express();
app.disable("x-powered-by");
// Room for an image sent as base64, up to the 15 MB file limit.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: false }));

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_KEY)
    .update(value)
    .digest("base64url");
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name)
      return decodeURIComponent(part.slice(index + 1).trim());
  }
  return "";
}

function hasSession(req) {
  const [expires, signature] = readCookie(req, SESSION_COOKIE).split(".");
  return (
    Boolean(expires && signature) &&
    Number(expires) > Date.now() &&
    safeEqual(signature, sign(expires))
  );
}

function setSessionCookie(req, res, value, maxAgeMs) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: maxAgeMs,
  });
}

const loginFailures = new Map();

function tooManyFailures(ip) {
  const entry = loginFailures.get(ip);
  if (entry && entry.resetAt < Date.now()) loginFailures.delete(ip);
  return (loginFailures.get(ip)?.count || 0) >= MAX_LOGIN_FAILURES;
}

function noteFailure(ip) {
  const entry = loginFailures.get(ip) || {
    count: 0,
    resetAt: Date.now() + LOGIN_WINDOW_MS,
  };
  entry.count += 1;
  loginFailures.set(ip, entry);
}

function requireAdmin(req, res, next) {
  if (hasSession(req)) return next();
  res.status(401).json({ error: "Sign in required" });
}

function requireToken(req, res, next) {
  if (!API_TOKEN) return next();
  const bearer = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  const token = req.headers["x-api-key"] || bearer;
  if (token && safeEqual(token, API_TOKEN)) return next();
  res.status(401).json({ error: "Invalid or missing API token" });
}

// Nodes in run order from the Input node, for the list view's route preview.
function chain(workflow) {
  const nodes = new Map((workflow.nodes || []).map((node) => [node.id, node]));
  const next = new Map(
    (workflow.connections || []).map(({ from, to }) => [from, to]),
  );
  const ordered = [];
  for (
    let node = inputNode(workflow);
    node && !ordered.includes(node);
    node = nodes.get(next.get(node.id))
  )
    ordered.push(node);
  return ordered;
}

function sendResponse(res, execution) {
  if (execution.status !== "success") {
    return res.status(500).json({
      error: execution.error?.message,
      node: execution.error?.nodeName,
      executionId: execution.id,
    });
  }
  const out = execution.response;
  if (out.mode === "redirect") return res.redirect(out.status || 302, out.url);
  if (out.mode === "text")
    return res
      .status(out.status || 200)
      .type("text/plain")
      .send(out.body);
  return res.status(out.status || 200).json(out.body);
}

// ---- editor + management API ----

app.get("/healthz", (req, res) =>
  res.json({ ok: true, workflows: store.workflowCount() }),
);

app.get("/api/auth/session", (req, res) =>
  res.json({ authenticated: hasSession(req), site: SITE_NAME }),
);

app.post("/api/auth/login", (req, res) => {
  if (tooManyFailures(req.ip))
    return res
      .status(429)
      .json({ error: "Too many attempts. Try again in a few minutes." });
  if (!safeEqual(String(req.body?.password || ""), ADMIN_PASSWORD)) {
    noteFailure(req.ip);
    return res.status(401).json({ error: "Wrong password" });
  }
  loginFailures.delete(req.ip);
  const expires = String(Date.now() + SESSION_TTL_MS);
  setSessionCookie(req, res, `${expires}.${sign(expires)}`, SESSION_TTL_MS);
  res.json({ authenticated: true, site: SITE_NAME });
});

app.post("/api/auth/logout", (req, res) => {
  setSessionCookie(req, res, "", 0);
  res.json({ authenticated: false });
});

app.use("/api", requireAdmin);
app.use("/api", siteRoutes);
app.get("/api/node-types", (req, res) => res.json(publicTypes()));
app.get("/api/workflows", (req, res) => {
  const lastRuns = new Map();
  for (const execution of store.listExecutions())
    if (!lastRuns.has(execution.workflowId))
      lastRuns.set(execution.workflowId, execution);
  res.json(
    store.list().map((workflow) => {
      const { id, name, slug, active, updatedAt } = workflow;
      const lockedBy = reels.lockReason(id);
      const usage = usageOf(workflow);
      const { matchType, matchValue } = inputSettings(workflow);
      const run = lastRuns.get(id);
      return {
        id,
        name,
        slug,
        active,
        usage,
        updatedAt,
        lockedBy,
        match:
          matchType === "none" ? null : { type: matchType, value: matchValue },
        steps: chain(workflow).map((node) => ({
          type: node.type,
          name: node.name,
        })),
        lastRun: run
          ? {
              status: run.status,
              startedAt: run.startedAt,
              durationMs: run.durationMs,
            }
          : null,
      };
    }),
  );
});
// A delivery workflow also runs on the videos server, whose engine can't run pipeline-only steps.
function deliveryError(workflow) {
  if (!usedFor(workflow, "delivery")) return null;
  const problems = deliveryProblems(workflow);
  return problems.length
    ? `Delivery workflows can't use pipeline-only steps: ${problems.join(", ")}. Remove them, or untick Delivery under Use for.`
    : null;
}

app.post("/api/workflows", async (req, res, next) => {
  const invalid = deliveryError(req.body || {});
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    res.status(201).json(await store.save(req.body || {}));
  } catch (err) {
    next(err);
  }
});

app.get("/api/workflows/:id", (req, res) => {
  const workflow = store.get(req.params.id);
  return workflow
    ? res.json({ ...workflow, lockedBy: reels.lockReason(workflow.id) })
    : res.status(404).json({ error: "Not found" });
});

app.put("/api/workflows/:id", async (req, res, next) => {
  if (!store.get(req.params.id))
    return res.status(404).json({ error: "Not found" });
  const invalid =
    deliveryError(req.body || {}) ||
    reels.saveProblem(req.params.id, req.body || {});
  if (invalid) return res.status(400).json({ error: invalid });
  forgetCache(req.params.id);
  try {
    res.json(await store.save(req.body || {}, req.params.id));
  } catch (err) {
    next(err);
  }
});

app.delete("/api/workflows/:id", async (req, res, next) => {
  const lockedBy = reels.lockReason(req.params.id);
  if (lockedBy)
    return res
      .status(409)
      .json({
        error: `This workflow is used by ${lockedBy}, so it can't be deleted.`,
      });
  forgetCache(req.params.id);
  try {
    res.json({ deleted: await store.remove(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// Shows whether ffmpeg and sharp actually run on this server, for debugging a host like Render.
app.get("/api/system/media-tools", async (req, res, next) => {
  try {
    const sharp = require("sharp");
    res.json({ ...(await require("./lib/ffmpeg").check()), sharp: { ok: true, libvips: sharp.versions.vips }, platform: `${process.platform}-${process.arch}`, node: process.version });
  } catch (err) {
    next(err);
  }
});

// ---- Variables ----

const isEnvName = (name) => name.startsWith("WF_") && process.env[name] !== undefined;

// Workflows that read $env.NAME, $env['NAME'] or $env["NAME"].
function workflowsUsing(name) {
  // Matched against JSON text, where the quotes in $env["NAME"] arrive escaped.
  const pattern = new RegExp(`\\$env(?:\\.${name}\\b|\\[\\s*\\\\?['"]${name}\\\\?['"]\\s*\\])`);
  return store
    .list()
    .filter((workflow) => pattern.test(JSON.stringify(workflow.nodes)))
    .map(({ id, name: workflowName }) => ({ id, name: workflowName }));
}

app.get("/api/variables", (req, res) => {
  const saved = variables.list();
  const inApp = new Set(saved.map((item) => item.name));
  res.json({
    configured: variables.configured(),
    items: saved.map((item) => ({
      ...item,
      overridesEnv: isEnvName(item.name),
      usedBy: workflowsUsing(item.name),
    })),
    fromEnv: Object.keys(process.env)
      .filter((name) => name.startsWith("WF_") && !inApp.has(name))
      .sort()
      .map((name) => ({ name, usedBy: workflowsUsing(name) })),
  });
});

async function saveVariable(res, name, value) {
  try {
    await variables.set(name, value);
    res.json({ saved: true });
  } catch (err) {
    if (err instanceof variables.VariableError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}

app.put("/api/variables/:name", async (req, res, next) => {
  saveVariable(res, req.params.name, req.body?.value).catch(next);
});

// Moves a WF_* value from the environment into the app, so it can be changed without a restart.
app.post("/api/variables/:name/import", async (req, res, next) => {
  const { name } = req.params;
  if (!isEnvName(name)) return res.status(404).json({ error: `${name} isn't a WF_ variable in the environment` });
  saveVariable(res, name, process.env[name]).catch(next);
});

app.delete("/api/variables/:name", async (req, res, next) => {
  try {
    res.json({ deleted: await variables.remove(req.params.name) });
  } catch (err) {
    next(err);
  }
});

// ---- Reel to post ----

app.get("/api/reels", async (req, res, next) => {
  try {
    let steps = reels.status(store);
    // `npm run reels:setup` writes straight to the database, so a running server picks those workflows up here.
    if (Object.values(steps).some((step) => !step.exists)) {
      await store.init();
      steps = reels.status(store);
    }
    res.json({ steps });
  } catch (err) {
    next(err);
  }
});

app.post("/api/reels/run/:step", async (req, res) => {
  const step = reels.STEPS[req.params.step];
  if (!step) return res.status(404).json({ error: "Unknown step" });
  const workflow = store.get(step.id);
  if (!workflow)
    return res.status(409).json({
      error: `The “${step.name}” workflow doesn't exist yet. Run npm run reels:setup.`,
      code: "not_setup",
    });
  const input = req.body?.input;
  // Recorded for History, but answered untrimmed so large fields like data URLs reach the page intact.
  const execution = await runWorkflow(
    workflow,
    input && typeof input === "object" && !Array.isArray(input) ? input : {},
    { mode: "reels" },
  );
  store.record(execution);
  if (execution.status !== "success")
    return res.status(502).json({
      error: execution.error?.message,
      node: execution.error?.nodeName,
      workflow: workflow.name,
      executionId: execution.id,
    });
  res.json({
    executionId: execution.id,
    result: responseValue(execution.response),
  });
});

const PASSED_VIDEO_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

// Streams a video from another site through the admin, so the page can read its frames in the browser
// (a cross-origin video taints the canvas). Range requests pass through, so seeking works.
app.get("/api/reels/video", async (req, res) => {
  const url = String(req.query.url || "");
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "url must be an http(s) URL" });
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  try {
    const upstream = await fetch(url, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      redirect: "follow",
      signal: controller.signal,
    });
    res.status(upstream.status);
    for (const name of PASSED_VIDEO_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader("Cache-Control", "private, max-age=600");
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    if (controller.signal.aborted) return;
    if (!res.headersSent) res.status(502).json({ error: `Couldn't load the video: ${err.cause?.message || err.message}` });
    else res.destroy();
  }
});

app.post("/api/reels/frame", async (req, res) => {
  try {
    res.json(await reels.grabFrame(req.body?.video, req.body?.time));
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// Runs the graph sent by the editor, saved or not, so edits can be tested before saving.
app.post("/api/execute", async (req, res) => {
  const { workflow, input } = req.body || {};
  if (!workflow || !Array.isArray(workflow.nodes))
    return res.status(400).json({ error: "workflow is required" });
  const execution = await runWorkflow(
    workflow,
    input && typeof input === "object" ? input : {},
    { mode: "manual" },
  );
  res.json(store.record(execution));
});

// Runs one step of the editor's graph on what its parent produced in an earlier run (`executionId`).
app.post("/api/execute-step", async (req, res, next) => {
  const { workflow, nodeId, executionId, input } = req.body || {};
  if (!workflow || !Array.isArray(workflow.nodes) || !nodeId)
    return res.status(400).json({ error: "workflow and nodeId are required" });

  const base = executionId ? store.getFullExecution(executionId) : null;
  if (base && workflow.id && base.workflowId && base.workflowId !== workflow.id)
    return res
      .status(400)
      .json({ error: "That run belongs to another workflow" });
  const isTrigger =
    workflow.nodes.find((node) => node.id === nodeId)?.type === "input";
  if (executionId && !base && !isTrigger) {
    return res.status(409).json({
      error:
        "The last run is no longer on the server. Run the whole workflow again.",
      code: "needs_run",
    });
  }

  try {
    const execution = await runSingleStep(
      workflow,
      nodeId,
      base,
      input && typeof input === "object" ? input : {},
    );
    res.json(store.trimStrings(store.record(execution)));
  } catch (err) {
    if (err instanceof StepUnavailable)
      return res.status(409).json({ error: err.message, code: "needs_run" });
    next(err);
  }
});

app.get("/api/workflows/:id/executions", (req, res) =>
  res.json(store.listExecutions(req.params.id)),
);
app.get("/api/executions", (req, res) => res.json(store.listExecutions()));
app.get("/api/executions/:id", (req, res) => {
  const execution = store.getExecution(req.params.id);
  return execution
    ? res.json(execution)
    : res.status(404).json({ error: "Not found" });
});

// ---- public endpoints ----

// Uploaded files become the same { data, mimeType, fileName, size } records HTTP Request produces.
async function multipartInput(req) {
  if (Number(req.headers["content-length"]) > MAX_FILE_BYTES * 2)
    throw Object.assign(new Error("Upload is too large"), { status: 413 });
  const request = new Request("http://upload.local/", {
    method: "POST",
    headers: { "content-type": req.headers["content-type"] },
    body: Readable.toWeb(req),
    duplex: "half",
  });
  const input = {};
  for (const [key, value] of await request.formData()) {
    if (typeof value === "string") {
      input[key] = value;
      continue;
    }
    if (value.size > MAX_FILE_BYTES)
      throw Object.assign(
        new Error(
          `${value.name} is over the ${MAX_FILE_BYTES / 1048576} MB limit`,
        ),
        { status: 413 },
      );
    const buffer = Buffer.from(await value.arrayBuffer());
    input[key] = {
      data: buffer.toString("base64"),
      mimeType:
        value.type || mimeFromName(value.name) || "application/octet-stream",
      fileName: value.name,
      size: buffer.length,
    };
  }
  return input;
}

app.all("/hook/:slug", requireToken, async (req, res) => {
  const workflow = store.bySlug(req.params.slug);
  if (!workflow || !workflow.active)
    return res.status(404).json({ error: "No active workflow at this path" });
  let body;
  try {
    body = req.is("multipart/form-data")
      ? await multipartInput(req)
      : req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
  } catch (err) {
    return res
      .status(err.status || 400)
      .json({ error: `Couldn't read the upload: ${err.message}` });
  }
  sendResponse(res, await run(workflow, { ...req.query, ...body }, "webhook"));
});

// Signer replacement: picks the first active workflow whose Input node matches the URL.
app.all("/resolve", requireToken, async (req, res) => {
  const input = {
    ...req.query,
    ...(req.body && typeof req.body === "object" ? req.body : {}),
  };
  const url = String(input.url || "");
  if (!/^https?:\/\//i.test(url))
    return res
      .status(400)
      .json({ error: "url must be an absolute http(s) URL" });

  const { workflowId, durationMs, failed, ...result } = await resolveUrl(
    url,
    input,
    "resolve",
  );
  if (!result.matched) return res.json(result);
  const { matched, workflow, executionId, error, node } = result;
  if (failed)
    return res
      .status(502)
      .json({ matched, workflow, executionId, error, node });
  res.json(result);
});

// Downloaded videos and frames, behind the same login as the editor.
app.use("/media", requireAdmin, express.static(MEDIA_DIR, { index: false }));

const WEB_DIR = path.join(__dirname, "web", "dist");
app.use("/", express.static(WEB_DIR, { index: false }));
app.get(/^\/(?!api\/|hook\/|resolve|media\/)/, (req, res) =>
  res.sendFile(
    path.join(WEB_DIR, "index.html"),
    (err) =>
      err &&
      res
        .status(503)
        .type("text/plain")
        .send("Editor is not built. Run npm run build."),
  ),
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

configureEngine({
  loadWorkflow: (ref) => store.get(ref) || store.bySlug(ref),
  onExecution: (execution) => store.record(execution),
});

async function start() {
  const storage = await store.init();
  await variables.init();
  await seedWorkflows(store);
  app.listen(PORT, () => {
    console.log(
      `linkproxy on http://localhost:${PORT} (workflows stored in ${storage})`,
    );
  });
}

start().catch((err) => {
  console.error(`Startup failed: ${err.message}`);
  process.exit(1);
});
