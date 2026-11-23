import { api } from "./api.js";

export const STEPS = [
  { key: "reel", label: "Reel" },
  { key: "frame", label: "Frame" },
  { key: "details", label: "Details" },
  { key: "post", label: "Post" },
  { key: "share", label: "Share" },
];

export const EMPTY_FORM = { title: "", description: "", thumbnail: "", realUrl: "", realUrlType: "player", categoryId: "none", duration: "", postTag: "" };

export const EMPTY_DRAFT = {
  id: null,
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
  return { ...rest, searchedFrame: null, customImage: null };
};

// Captured frames and pasted images are kept in memory only; they're large and can simply be taken again.
const TRANSIENT = ["searchedFrame", "customImage"];

export const withoutTransient = (draft) => Object.fromEntries(Object.entries(draft).filter(([key]) => !TRANSIENT.includes(key)));

// Fills in keys added since a draft was saved. Drafts saved before several thumbnails were kept had a single `thumbnail`.
export function normalizeDraft(saved) {
  if (!saved) return EMPTY_DRAFT;
  const thumbnails = saved.thumbnails || (saved.thumbnail ? [{ url: saved.thumbnail.url, label: "Frame" }] : []);
  return { ...EMPTY_DRAFT, ...saved, thumbnails, form: { ...EMPTY_FORM, ...saved.form } };
}

// Once the post exists, the earlier steps are closed so it can't be created twice.
export function reachableSteps(draft) {
  if (draft.post) return ["share"];
  return STEPS.map((s) => s.key).filter((key) => key === "reel" || (draft.video && (key !== "details" || draft.matches) && key !== "share"));
}

// The step a reel was left on, judged from what it has; matches the server's stage for the Recent list.
export function resumeStep(draft) {
  if (draft.post) return "share";
  if (draft.form.title || draft.form.realUrl) return "post";
  if (draft.matches) return "details";
  return draft.video ? "frame" : "reel";
}

export const STAGE_LABELS = {
  frame: "Picking a frame",
  details: "Choosing a match",
  post: "Filling in the post",
  share: "Posted, not shared yet",
  shared: "Posted and shared",
};

export const loadRecentReels = () => api("/api/reels/drafts");
export const findSavedReel = (url, { signal } = {}) => api(`/api/reels/drafts?url=${encodeURIComponent(url)}`, { signal });
export const startSavedReel = (reelUrl, video) => api("/api/reels/drafts", { method: "POST", body: { reelUrl, video } });
export const loadSavedReel = (id) => api(`/api/reels/drafts/${encodeURIComponent(id)}`);
export const deleteSavedReel = (id) => api(`/api/reels/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
export const saveReel = (id, draft, { keepalive = false } = {}) =>
  api(`/api/reels/drafts/${encodeURIComponent(id)}`, { method: "PUT", body: { draft: withoutTransient({ ...draft, id: undefined }) }, keepalive });

// A reel link without tracking parameters, for showing in lists.
export function shortReel(url) {
  try {
    const parsed = new URL(url);
    const code = /\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/.exec(parsed.pathname)?.[1];
    return code && /instagram|instagr\.am/.test(parsed.hostname) ? `Reel ${code}` : `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`;
  } catch {
    return url;
  }
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(iso) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  for (const [unit, size] of UNITS) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "just now";
}

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
// `variants` lists extra JPEG sizes to make from the full-size frame, e.g. [700, 350] for FaceDigger.
export async function captureFrame(video, src, { variants = [] } = {}) {
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
    const file = { data, mimeType: "image/jpeg", fileName, size: Math.floor((data.length * 3) / 4) };
    return { time, dataUrl, file, variants: jpegVariants(canvas, canvas.width, canvas.height, variants) };
  } catch (err) {
    if (err.name !== "SecurityError") throw err;
    const file = await api("/api/reels/frame", { method: "POST", body: { video: src, time } });
    const dataUrl = `data:${file.mimeType};base64,${file.data}`;
    const image = await loadImage(dataUrl);
    return { time, dataUrl, file: { ...file, fileName }, variants: jpegVariants(image, image.naturalWidth, image.naturalHeight, variants) };
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Couldn't read the captured frame"));
    image.src = src;
  });
}

const VARIANT_QUALITY = 0.9;

// Sized like FaceDigger's own site (Compressor.js "contain"): fits inside size × size keeping the aspect ratio,
// never enlarges, rounds down, and draws once onto white, then encodes JPEG at 0.9.
function jpegVariant(source, sourceWidth, sourceHeight, size) {
  const aspect = sourceWidth / sourceHeight;
  const fitted = size < size * aspect ? { width: size, height: size / aspect } : { width: size * aspect, height: size };
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(Math.min(sourceWidth, fitted.width));
  canvas.height = Math.floor(Math.min(sourceHeight, fitted.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", VARIANT_QUALITY);
}

const jpegVariants = (source, width, height, sizes) => Object.fromEntries(sizes.map((size) => [size, jpegVariant(source, width, height, size)]));

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
// `variants` works as in captureFrame, and needs an image the browser can draw.
export async function imageFromDevice(file, { variants = [] } = {}) {
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
    const encoded = { data, mimeType: "image/jpeg", fileName: `${stem}.jpg`, size: Math.floor((data.length * 3) / 4) };
    return { dataUrl, file: encoded, variants: jpegVariants(canvas, canvas.width, canvas.height, variants) };
  } catch {
    if (variants.length) throw new Error("The browser can't read this image format. Use a JPEG, PNG or WebP.");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("That image is over 15 MB");
    const dataUrl = await readAsDataUrl(file);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { dataUrl, file: { data, mimeType: file.type, fileName: file.name, size: file.size }, variants: {} };
  }
}

export async function imageFromUrl(url, options) {
  const link = url.trim();
  if (!/^https?:\/\//i.test(link)) throw new Error("The link must start with http:// or https://");
  const res = await fetch(`/api/reels/image?url=${encodeURIComponent(link)}`, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Couldn't fetch that image (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const name = decodeURIComponent(new URL(link).pathname.split("/").pop() || "") || "image";
  return imageFromDevice(new File([blob], name, { type: blob.type }), options);
}

// Runs the "Upload thumbnail" workflow, the same one Reel to post uses, and returns the hosted URL.
export async function uploadImage(image) {
  const result = await runReelStep("thumbnail", { image: image.file });
  const url = pickUrl(result, THUMBNAIL_KEYS);
  if (!url) throw new Error("The upload workflow finished but returned no image URL. Its Output step must return { url }.");
  return url;
}

export function failureMessage(err) {
  if (err.name === "AbortError") return "";
  return err.node ? `${err.node}: ${err.message}` : err.message;
}
