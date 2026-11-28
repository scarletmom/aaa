const { HTTP_URL, TERABOX_KEY, TERABOX_DURATION, InputError, trim, canonicalTeraboxUrl } = require("./inputs");
const teraboxVideos = require("./teraboxVideos");
const teraboxThumbnails = require("./teraboxThumbnails");

const MAX_ROWS = 10000;
const FIELDS = ["key", "title", "thumbnail", "duration", "views", "createdAt", "teraboxUrl"];
const MAX_VIEWS = 4294967295;
// The range a MySQL TIMESTAMP column can hold.
const MIN_CREATED = Date.UTC(1970, 0, 2);
const MAX_CREATED = Date.UTC(2038, 0, 19);
const HEADER_NAMES = {
  key: ["id", "key", "video_key"],
  title: ["file_name", "filename", "title", "name"],
  thumbnail: ["thumbnail", "thumb", "thumbnail_url"],
  duration: ["duration", "length"],
  teraboxUrl: ["url", "terabox_url", "link", "share_url"],
  views: ["views", "view_count", "views_count", "plays"],
  createdAt: ["created_at", "created", "date", "upload_date", "uploaded_at", "published_at"],
};
const VIDEO_EXTENSION = /\.(mp4|mkv|mov|avi|webm|m4v|ts|flv|wmv|3gp|mpe?g)$/i;

// Spreadsheets paste as tab-separated text; some locales export CSV with semicolons.
function delimiterOf(text) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  if (firstLine.includes("\t")) return "\t";
  const count = (c) => firstLine.split(c).length;
  return count(";") > count(",") ? ";" : ",";
}

// RFC 4180: a quoted field may hold the delimiter, line breaks, and "" for a quote.
function parseRecords(text, delimiter) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field || record.length) records.push([...record, field]);
  return records;
}

function columnsOf(firstRecord) {
  const names = firstRecord.map((cell) => cell.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const columns = {};
  for (const field of FIELDS) {
    const index = names.findIndex((name) => HEADER_NAMES[field].includes(name));
    if (index >= 0) columns[field] = index;
  }
  if (!Object.keys(columns).length) return null;
  const missing = ["key", "title"].filter((field) => columns[field] === undefined);
  if (missing.length) throw new InputError({ csv: `The header row needs ${missing.map((f) => `${f === "key" ? "an" : "a"} ${HEADER_NAMES[f][0]}`).join(" and ")} column.` });
  return columns;
}

function formatSeconds(total) {
  const pad = (n) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${pad(minutes)}:${pad(total % 60)}`;
}

/** Seconds, m:ss or h:mm:ss in; the table's "04:23" / "1:02:03" out. Null when unreadable. */
function normalizeDuration(raw) {
  if (!raw) return "";
  let seconds;
  if (/^\d+(\.\d+)?$/.test(raw)) seconds = Math.round(Number(raw));
  else if (/^\d+(:\d{1,2}){1,2}$/.test(raw)) seconds = raw.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  else return null;
  const text = formatSeconds(seconds);
  return TERABOX_DURATION.test(text) ? text : null;
}

/** A whole number, with or without thousands separators ("12,345", "12 345"); 0 when blank, null when unreadable. */
function parseViews(raw) {
  if (!raw) return 0;
  const digits = raw.replace(/[\s,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const views = Number(digits);
  return views <= MAX_VIEWS ? views : null;
}

const DATE_TIME = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Unix seconds or milliseconds, or YYYY-MM-DD with an optional time (UTC unless it carries an offset).
 * Returns null when blank, false when unreadable.
 */
function parseCreatedAt(raw) {
  if (!raw) return null;
  let time;
  if (/^\d+$/.test(raw)) time = raw.length > 11 ? Number(raw) : Number(raw) * 1000;
  else {
    const match = DATE_TIME.exec(raw);
    if (!match) return false;
    const [, year, month, day, hour = "0", minute = "0", second = "0", ms = "0", zone] = match;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms.padEnd(3, "0")));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== Number(day) || hour > 23) return false;
    time = date.getTime();
    if (zone && zone.toUpperCase() !== "Z") {
      const [, sign, hours, minutes] = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
      time -= (sign === "-" ? -1 : 1) * (hours * 60 + Number(minutes)) * 60000;
    }
  }
  return time >= MIN_CREATED && time <= MAX_CREATED ? new Date(time) : false;
}

function titleFromFileName(fileName) {
  return fileName.replace(VIDEO_EXTENSION, "").trim() || fileName;
}

function videoOf(cells, columns) {
  const cell = (field, max) => (columns[field] === undefined ? "" : trim(cells[columns[field]], max));
  const key = cell("key", 64);
  const title = titleFromFileName(cell("title", 300)).slice(0, 255);
  const thumbnail = cell("thumbnail", 2048);
  const teraboxUrl = cell("teraboxUrl", 2048);
  const duration = normalizeDuration(cell("duration", 16));
  const views = parseViews(cell("views", 32));
  const createdAt = parseCreatedAt(cell("createdAt", 40));

  if (!key) return { error: "id is empty" };
  if (!TERABOX_KEY.test(key)) return { error: `id “${key}” must be up to 32 letters, digits, underscores or hyphens` };
  if (!title) return { error: "file_name is empty" };
  if (thumbnail && !HTTP_URL.test(thumbnail)) return { error: "thumbnail must start with http:// or https://" };
  if (duration === null) return { error: `duration “${cell("duration", 16)}” isn't seconds, mm:ss or h:mm:ss` };
  if (teraboxUrl && !HTTP_URL.test(teraboxUrl)) return { error: "url must start with http:// or https://" };
  if (views === null) return { error: `views “${cell("views", 32)}” isn't a whole number` };
  if (createdAt === false) return { error: `created_at “${cell("createdAt", 40)}” isn't a date like 2026-11-28 14:30:00 or a Unix timestamp` };
  return { video: { key, title, thumbnail, duration, views, createdAt, teraboxUrl: teraboxUrl ? canonicalTeraboxUrl(teraboxUrl) : "" } };
}

function duplicateReason(video, inFile, taken) {
  const key = video.key.toLowerCase();
  const url = video.teraboxUrl.toLowerCase();
  if (inFile.keys.has(key)) return `id “${video.key}” appears earlier in the file`;
  if (taken.keys.has(key)) return `id “${video.key}” already exists`;
  if (url && inFile.urls.has(url)) return "url appears earlier in the file";
  if (url && taken.urls.has(url)) return "url is already used by another video";
  return "";
}

/**
 * Adds a row to terabox_videos for each CSV record (id, file_name, thumbnail, duration, views, created_at, url).
 * The header row is optional; without one the columns are read in that order.
 * Thumbnails are then uploaded to our image host in the background and the rows switched to the hosted URLs.
 */
async function importCsv(csv) {
  const text = csv.replace(/^﻿/, "");
  if (!text.trim()) throw new InputError({ csv: "Paste CSV text or choose a CSV file." });

  const records = parseRecords(text, delimiterOf(text));
  const columns = columnsOf(records[0]);
  const firstData = columns ? 1 : 0;
  const order = columns || Object.fromEntries(FIELDS.map((field, index) => [field, index]));

  const rows = records.map((cells, index) => ({ cells, row: index + 1 })).slice(firstData).filter(({ cells }) => cells.some((c) => c.trim()));
  if (!rows.length) throw new InputError({ csv: "The CSV has no video rows." });
  if (rows.length > MAX_ROWS) throw new InputError({ csv: `Import up to ${MAX_ROWS.toLocaleString("en-US")} rows at a time.` });

  const taken = await teraboxVideos.takenKeysAndUrls();
  const inFile = { keys: new Set(), urls: new Set() };
  const videos = [];
  const skipped = [];
  for (const { cells, row } of rows) {
    const { video, error } = videoOf(cells, order);
    const reason = error || duplicateReason(video, inFile, taken);
    if (reason) {
      skipped.push({ row, reason });
      continue;
    }
    inFile.keys.add(video.key.toLowerCase());
    if (video.teraboxUrl) inFile.urls.add(video.teraboxUrl.toLowerCase());
    videos.push(video);
  }

  const added = videos.length ? await teraboxVideos.insertMany(videos) : 0;
  const thumbnails = added ? teraboxThumbnails.enqueue(videos) : 0;
  return { added, skipped, raced: videos.length - added, thumbnails };
}

module.exports = { importCsv };
