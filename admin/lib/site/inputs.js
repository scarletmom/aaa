const posts = require("./posts");
const categories = require("./categories");
const { parseDuration, probeDuration } = require("./media");

const HTTP_URL = /^https?:\/\//i;

function origin(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(HTTP_URL.test(value) ? value : `https://${value}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

const SITE_URL = origin(process.env.SITE_URL);
const AD_SITE = origin(process.env.AD_SITE_URL);

const trim = (value, max) => String(value ?? "").trim().slice(0, max);

class InputError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0]);
    this.errors = errors;
  }
}

function checked(values, errors) {
  if (Object.keys(errors).length) throw new InputError(errors);
  return values;
}

function postInput(body, { isEdit }) {
  const values = {
    postTag: trim(body.postTag, 64),
    title: trim(body.title, 200),
    thumbnail: trim(body.thumbnail, 1000),
    description: trim(body.description, 2000),
    realUrl: trim(body.realUrl, 2000),
    categoryId: categories.parseId(body.categoryId),
    durationSeconds: parseDuration(trim(body.duration, 12)),
  };
  const errors = {};
  if (!isEdit && values.postTag && !posts.isValidTag(values.postTag)) {
    errors.postTag = "Use 1-64 characters: letters, digits, dot, underscore or hyphen.";
  }
  if (!values.title) errors.title = "Title is required.";
  if (!values.description) errors.description = "Description is required.";
  if (values.thumbnail && !HTTP_URL.test(values.thumbnail)) errors.thumbnail = "Must start with http:// or https://";
  if (!values.realUrl) errors.realUrl = "Real URL is required.";
  else if (!HTTP_URL.test(values.realUrl)) errors.realUrl = "Must start with http:// or https://";
  if (Number.isNaN(values.durationSeconds)) errors.duration = "Use seconds, m:ss or h:mm:ss, e.g. 12:34.";
  return { values, errors };
}

// A category deleted while the form was open would otherwise fail the foreign key.
async function checkCategory(values, errors) {
  if (values.categoryId && !(await categories.get(values.categoryId))) {
    errors.categoryId = "That category no longer exists. Pick another one.";
  }
}

// Shared by the Content form and the Create Post workflow step, so both apply the same rules.
async function createPost(body) {
  const { values, errors } = postInput(body, { isEdit: false });
  if (!values.postTag && values.title) values.postTag = await posts.uniqueTag(values.title);
  if (!errors.postTag && !values.postTag) errors.postTag = "Add a post tag, or a title to build one from.";
  if (!errors.postTag && values.postTag && (await posts.exists(values.postTag))) errors.postTag = "That tag is already in use.";
  await checkCategory(values, errors);
  checked(values, errors);

  // A blank length means "work it out from the stream".
  values.durationSeconds ??= await probeDuration(values.realUrl);
  await posts.create(values);
  return posts.get(values.postTag);
}

module.exports = { HTTP_URL, SITE_URL, AD_SITE, InputError, checked, trim, postInput, checkCategory, createPost };
