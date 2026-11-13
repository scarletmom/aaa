import { api } from "./api.js";

export const STEPS = [
  { key: "reel", label: "Reel" },
  { key: "frame", label: "Frame" },
  { key: "details", label: "Details" },
  { key: "post", label: "Post" },
  { key: "share", label: "Share" },
];

export const EMPTY_FORM = { title: "", description: "", thumbnail: "", realUrl: "", categoryId: "none", duration: "", postTag: "" };

export const EMPTY_DRAFT = {
  reelUrl: "",
  video: null,
  frameTime: 0,
  thumbnails: [],
  matches: null,
  chosen: null,
  searchedTime: null,
  form: EMPTY_FORM,
  autoTag: true,
  post: null,
  share: null,
};

// Everything that came from the previous reel, so a new reel starts a clean post.
export const freshReel = () => {
  const { reelUrl, video, post, share, ...rest } = EMPTY_DRAFT;
  return { ...rest, searchedFrame: null };
};

export const THUMBNAIL_KEYS = ["url", "thumbnail", "link", "image", "file", "result"];

export const loadReelSetup = () => api("/api/reels");

export async function runReelStep(step, input, { signal } = {}) {
  const { result } = await api(`/api/reels/run/${step}`, { method: "POST", body: { input }, signal });
  return result || {};
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const isUsableUrl = (value) => /^https?:\/\//i.test(value) || value.startsWith("/media/");

// Workflows are wired by hand, so accept the first sensible key rather than one exact shape.
export function pickUrl(result, keys) {
  if (!isObject(result)) return "";
  for (const key of keys) {
    const value = result[key];
    const url = isObject(value) ? text(value.url) : text(value);
    if (url && isUsableUrl(url)) return url;
  }
  return "";
}

export function mediaRef(result) {
  const candidates = [result, result?.file, result?.video];
  return candidates.find((value) => isObject(value) && value.ref === "media" && typeof value.path === "string") || null;
}

export const absoluteUrl = (url) => (url ? new URL(url, window.location.origin).href : "");

// Videos from other sites go through the admin, so the browser can read their frames.
export function playableUrl(url) {
  if (!/^https?:\/\//i.test(url || "")) return url;
  return new URL(url).origin === window.location.origin ? url : `/api/reels/video?url=${encodeURIComponent(url)}`;
}

// Accepts 0-1, 0-100, or text like "87.5%"; text with % is already a percentage.
function percent(value) {
  const isText = typeof value === "string";
  const number = isText ? Number.parseFloat(value) : Number(value);
  if (value === null || value === "" || !Number.isFinite(number)) return null;
  const scaled = isText && value.includes("%") ? number : number <= 1 ? number * 100 : number;
  return Math.round(Math.min(Math.max(scaled, 0), 100) * 10) / 10;
}

// FaceDigger answers { <tag>: { results: [...] }, ... }; a bare array under a tag works too.
export function matchGroups(result) {
  if (!isObject(result)) return [];
  const groups = [];
  for (const [tag, value] of Object.entries(result)) {
    const list = Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : null;
    if (!list) continue;
    const results = list
      .filter(isObject)
      .map((item, index) => ({
        key: `${tag}:${index}`,
        tag,
        url: text(item.url ?? item.link),
        title: text(item.title ?? item.name),
        thumbnail: text(item.thumbnail ?? item.thumb ?? item.image),
        similarity: percent(item.similarity ?? item.score),
      }))
      .filter((item) => item.url || item.thumbnail)
      .sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
    groups.push({ tag, results });
  }
  return groups;
}

// Create Post fails with "field: message; field: message", the same rules as the Content form.
const FIELD_ALIASES = { categoryId: "category" };
export function fieldErrors(message) {
  const errors = {};
  for (const part of String(message || "").split(/;\s+/)) {
    const match = /^(\w+):\s*(.+)$/.exec(part.trim());
    if (match) errors[FIELD_ALIASES[match[1]] || match[1]] = match[2];
  }
  return errors;
}

export function formatClock(seconds) {
  const value = Math.max(Number(seconds) || 0, 0);
  const minutes = Math.floor(value / 60);
  const rest = (value % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${rest}`;
}

const JPEG_QUALITY = 0.92;

// Reads the frame in the browser when it can; a cross-origin video taints the canvas, so the server grabs it with ffmpeg instead.
export async function captureFrame(video, src) {
  if (!video || !video.videoWidth) throw new Error("The video isn't ready yet. Wait for it to load, then try again.");
  const time = video.currentTime;
  const fileName = `frame-${time.toFixed(1)}s.jpg`;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { time, dataUrl, file: { data, mimeType: "image/jpeg", fileName, size: Math.floor((data.length * 3) / 4) } };
  } catch (err) {
    if (err.name !== "SecurityError") throw err;
    const file = await api("/api/reels/frame", { method: "POST", body: { video: src, time } });
    return { time, dataUrl: `data:${file.mimeType};base64,${file.data}`, file: { ...file, fileName } };
  }
}

const MAX_IMAGE_SIDE = 2048;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

// Re-encodes as JPEG no larger than 2048px, so phone photos stay small; formats the browser can't draw are sent as they are.
export async function imageFromDevice(file) {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file");
  const stem = file.name.replace(/\.[^.]+$/, "") || "image";
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { dataUrl, file: { data, mimeType: "image/jpeg", fileName: `${stem}.jpg`, size: Math.floor((data.length * 3) / 4) } };
  } catch {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("That image is over 15 MB");
    const dataUrl = await readAsDataUrl(file);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { dataUrl, file: { data, mimeType: file.type, fileName: file.name, size: file.size } };
  }
}

export function failureMessage(err) {
  if (err.name === "AbortError") return "";
  return err.node ? `${err.node}: ${err.message}` : err.message;
}
