const express = require("express");
const db = require("./db");
const posts = require("./posts");
const categories = require("./categories");
const { probeDuration } = require("./media");
const { resolveVisit } = require("./visit");
const visits = require("./visits");

const { HTTP_URL, SITE_URL, AD_SITE, InputError, checked, trim, postInput, checkCategory, createPost } = require("./inputs");

function categoryInput(body) {
  const values = {
    name: trim(body.name, 100),
    avatar: trim(body.avatar, 1000),
    postTags: [...new Set((Array.isArray(body.postTags) ? body.postTags : []).map(String))],
  };
  const errors = {};
  if (!values.name) errors.name = "Name is required.";
  if (values.avatar && !HTTP_URL.test(values.avatar)) errors.avatar = "Must start with http:// or https://";
  return { values, errors };
}

const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

const router = express.Router();

router.get("/site", (req, res) =>
  res.json({
    database: db.configured,
    siteUrl: SITE_URL,
    playerPrefix: AD_SITE ? `${AD_SITE}/player/?url=` : "",
    embedPrefix: AD_SITE ? `${AD_SITE}/embed/?url=` : "",
  })
);

router.use(["/posts", "/categories", "/visits"], (req, res, next) => {
  if (db.configured) return next();
  res.status(503).json({ error: "The website database is not configured.", code: "no_database" });
});

router.get("/posts", handle(async (req, res) => res.json(await posts.list())));

router.get(
  "/posts/:tag",
  handle(async (req, res) => {
    const post = await posts.get(req.params.tag);
    return post ? res.json(post) : res.status(404).json({ error: "Post not found" });
  })
);

router.post(
  "/posts",
  handle(async (req, res) => res.status(201).json(await createPost(req.body || {})))
);

router.put(
  "/posts/:tag",
  handle(async (req, res) => {
    const { tag } = req.params;
    if (!(await posts.exists(tag))) return res.status(404).json({ error: "Post not found" });
    const { values, errors } = postInput(req.body || {}, { isEdit: true });
    await checkCategory(values, errors);
    checked(values, errors);

    values.durationSeconds ??= await probeDuration(values.realUrl);
    await posts.update(tag, values);
    res.json(await posts.get(tag));
  })
);

router.post(
  "/posts/:tag/enabled",
  handle(async (req, res) => {
    const ok = await posts.setEnabled(req.params.tag, Boolean(req.body?.enabled));
    return ok ? res.json({ enabled: Boolean(req.body?.enabled) }) : res.status(404).json({ error: "Post not found" });
  })
);

router.post(
  "/posts/:tag/move",
  handle(async (req, res) => res.json({ moved: await posts.move(req.params.tag, req.body?.direction === "up" ? "up" : "down") }))
);

// Runs the post's Real URL through the workflows the way a visitor's /final would, without the gate.
router.post(
  "/posts/:tag/visit",
  handle(async (req, res) => {
    const post = await posts.get(req.params.tag);
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!HTTP_URL.test(post.realUrl || "")) return res.status(422).json({ error: "This post's Real URL is not an http(s) link." });

    const { url, data, ...visit } = await resolveVisit(post.realUrl);
    if (visit.failed) return res.status(502).json({ ...visit, error: `Workflow “${visit.workflow}” failed${visit.node ? ` at ${visit.node}` : ""}: ${visit.error}` });
    res.json({ realUrl: post.realUrl, ...visit });
  })
);

router.delete("/posts/:tag", handle(async (req, res) => res.json({ deleted: await posts.remove(req.params.tag) })));

router.get("/visits", handle(async (req, res) => res.json(await visits.list(req.query))));

router.get("/categories", handle(async (req, res) => res.json(await categories.list())));

router.get(
  "/categories/:id",
  handle(async (req, res) => {
    const category = await categories.get(req.params.id);
    if (!category) return res.status(404).json({ error: "Category not found" });
    res.json({ ...category, postTags: await categories.memberTags(category.id) });
  })
);

async function saveCategory(req, res, existing) {
  const { values, errors } = categoryInput(req.body || {});
  if (!errors.name && (await categories.nameTaken(values.name, existing?.id))) errors.name = "A category with that name already exists.";
  checked(values, errors);

  const id = existing ? existing.id : await categories.create(values);
  if (existing) await categories.update(id, values);
  await categories.setPosts(id, values.postTags);
  res.status(existing ? 200 : 201).json(await categories.get(id));
}

router.post("/categories", handle((req, res) => saveCategory(req, res, null)));

router.put(
  "/categories/:id",
  handle(async (req, res) => {
    const existing = await categories.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Category not found" });
    await saveCategory(req, res, existing);
  })
);

router.delete(
  "/categories/:id",
  handle(async (req, res) => {
    const id = categories.parseId(req.params.id);
    res.json({ deleted: id ? await categories.remove(id) : false });
  })
);

router.use((err, req, res, next) => {
  if (err instanceof InputError) return res.status(400).json({ error: err.message, errors: err.errors });
  next(err);
});

module.exports = router;
