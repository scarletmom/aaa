const fs = require("node:fs");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const MEDIA_DIR = path.resolve(DATA_DIR, "media");

// A saved file travels between steps as this small reference instead of base64,
// so videos of any size fit in run records. `url` is served behind the admin login.
const isRef = (value) => Boolean(value && typeof value === "object" && value.ref === "media" && typeof value.path === "string");

function cleanSegment(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|-+$/g, "")
    .slice(0, 100);
}

function cleanFolder(folder) {
  const segments = String(folder || "").split(/[\\/]+/).map(cleanSegment).filter(Boolean);
  if (!segments.length) throw new Error("Folder is empty");
  return segments.join("/");
}

function absolutePath(relative) {
  const absolute = path.resolve(MEDIA_DIR, relative);
  if (!absolute.startsWith(MEDIA_DIR + path.sep)) throw new Error(`Path is outside the media folder: ${relative}`);
  return absolute;
}

const pathOf = (ref) => absolutePath(ref.path);

function toRef(relative, { mimeType, size }) {
  return {
    ref: "media",
    path: relative,
    url: `/media/${relative.split("/").map(encodeURIComponent).join("/")}`,
    fileName: path.basename(relative),
    mimeType: mimeType || "application/octet-stream",
    size,
  };
}

// Reserves `folder/name`, adding -2, -3 … when a file with that name is already there.
function reservePath(folder, fileName) {
  const dir = cleanFolder(folder);
  fs.mkdirSync(absolutePath(dir), { recursive: true });
  const name = cleanSegment(fileName) || "file";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let n = 2; fs.existsSync(absolutePath(`${dir}/${candidate}`)); n += 1) candidate = `${stem}-${n}${ext}`;
  return `${dir}/${candidate}`;
}

async function saveBuffer(folder, fileName, buffer, mimeType) {
  const relative = reservePath(folder, fileName);
  await fs.promises.writeFile(absolutePath(relative), buffer);
  return toRef(relative, { mimeType, size: buffer.length });
}

function byteLimit(maxBytes) {
  let seen = 0;
  return new Transform({
    transform(chunk, encoding, done) {
      seen += chunk.length;
      if (seen > maxBytes) return done(new Error(`Download is over the ${Math.round(maxBytes / 1048576)} MB limit`));
      done(null, chunk);
    },
  });
}

// Streams a response body to disk, so large videos never sit in memory.
async function saveStream(folder, fileName, res, { mimeType, maxBytes }) {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) throw new Error(`File is ${(declared / 1048576).toFixed(1)} MB, over the ${Math.round(maxBytes / 1048576)} MB limit`);
  const relative = reservePath(folder, fileName);
  const target = absolutePath(relative);
  const partial = `${target}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body), byteLimit(maxBytes), fs.createWriteStream(partial));
    await fs.promises.rename(partial, target);
  } catch (err) {
    await fs.promises.rm(partial, { force: true });
    throw err;
  }
  return toRef(relative, { mimeType, size: (await fs.promises.stat(target)).size });
}

function refForExisting(relative, mimeType) {
  return toRef(relative, { mimeType, size: fs.statSync(absolutePath(relative)).size });
}

module.exports = { MEDIA_DIR, isRef, pathOf, cleanFolder, reservePath, absolutePath, saveBuffer, saveStream, refForExisting };
