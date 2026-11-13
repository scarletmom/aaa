// Files travel between steps as { data: base64, mimeType, fileName, size }, so they survive JSON
// round-trips through run records and expressions. Files saved to disk travel as storage references.
const fs = require("node:fs");
const storage = require("./storage");

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
};
const EXT_BY_MIME = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]));
EXT_BY_MIME["image/jpeg"] = "jpg";

const BINARY_TYPES = /^(image|audio|video|font)\/|^application\/(octet-stream|pdf|zip|x-zip|gzip|x-gzip|x-tar)$/i;

const baseMime = (value) => String(value || "").split(";")[0].trim().toLowerCase();
const isBinaryType = (contentType) => BINARY_TYPES.test(baseMime(contentType)) && !/svg|json|xml/.test(baseMime(contentType));

function sniffMime(buffer) {
  const hex = buffer.subarray(0, 12).toString("hex");
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("47494638")) return "image/gif";
  if (hex.startsWith("52494646") && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (hex.startsWith("25504446")) return "application/pdf";
  return "";
}

function mimeFromName(fileName) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(fileName || ""))?.[1]?.toLowerCase();
  return (ext && MIME_BY_EXT[ext]) || "";
}

function nameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return "";
  }
}

function checkSize(size) {
  if (size > MAX_FILE_BYTES) throw new Error(`File is ${(size / 1048576).toFixed(1)} MB, over the ${MAX_FILE_BYTES / 1048576} MB limit`);
}

function finish(buffer, { mimeType, fileName }) {
  checkSize(buffer.length);
  const mime = baseMime(mimeType) || mimeFromName(fileName) || sniffMime(buffer) || "application/octet-stream";
  return { buffer, mimeType: mime, fileName: fileName || `file.${EXT_BY_MIME[mime] || "bin"}` };
}

// Reads a response body as a file record, refusing anything over the size limit.
async function fileFromResponse(res, url) {
  const declared = Number(res.headers.get("content-length"));
  if (declared) checkSize(declared);
  const buffer = Buffer.from(await res.arrayBuffer());
  const disposition = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("content-disposition") || "")?.[1];
  const { mimeType, fileName } = finish(buffer, { mimeType: res.headers.get("content-type"), fileName: disposition || nameFromUrl(url) });
  return { data: buffer.toString("base64"), mimeType, fileName, size: buffer.length };
}

// Accepts a file record, a data: URL, an http(s) URL to download, or plain base64 text.
async function loadFile(value, { fileName, mimeType, timeoutMs = 15000, fetchFn = fetch } = {}) {
  if (value && typeof value === "object") {
    const record = value.file && typeof value.file === "object" ? value.file : value;
    if (storage.isRef(record)) {
      const { size } = await fs.promises.stat(storage.pathOf(record));
      checkSize(size);
      const buffer = await fs.promises.readFile(storage.pathOf(record));
      return finish(buffer, { mimeType: mimeType || record.mimeType, fileName: fileName || record.fileName });
    }
    if (typeof record.data !== "string") throw new Error("File object needs a base64 `data` field, like the `file` a binary response produces");
    return finish(Buffer.from(record.data, "base64"), { mimeType: mimeType || record.mimeType, fileName: fileName || record.fileName });
  }

  const text = String(value ?? "").trim();
  if (!text) throw new Error("File is empty");

  const dataUrl = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/i.exec(text);
  if (dataUrl) {
    const isBase64 = /;base64/i.test(dataUrl[2]);
    const buffer = isBase64 ? Buffer.from(dataUrl[3], "base64") : Buffer.from(decodeURIComponent(dataUrl[3]));
    return finish(buffer, { mimeType: mimeType || dataUrl[1], fileName });
  }

  if (/^https?:\/\//i.test(text)) {
    let res;
    try {
      res = await fetchFn(text, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new Error(`Couldn't download the file from ${text}: ${err.cause?.message || err.message}`);
    }
    if (!res.ok) throw new Error(`Downloading the file from ${text} answered HTTP ${res.status}`);
    const file = await fileFromResponse(res, text);
    return finish(Buffer.from(file.data, "base64"), { mimeType: mimeType || file.mimeType, fileName: fileName || file.fileName });
  }

  const compact = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) {
    throw new Error("File must be a URL, a data: URL, base64 text, or a file from a binary response ({{ $json.file }})");
  }
  return finish(Buffer.from(compact, "base64"), { mimeType, fileName });
}

module.exports = { MAX_FILE_BYTES, EXT_BY_MIME, loadFile, fileFromResponse, isBinaryType, baseMime, mimeFromName, nameFromUrl };
