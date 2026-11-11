import { api } from "./api.js";

let sitePromise;
export function loadSite() {
  sitePromise ||= api("/api/site").catch((err) => {
    sitePromise = null;
    throw err;
  });
  return sitePromise;
}

export const postPath = (tag) => `/content/${encodeURIComponent(tag)}`;
export const duplicatePath = (tag) => `/content/new?from=${encodeURIComponent(tag)}`;
export const categoryPath = (id) => `/categories/${id}`;
export const publicPostUrl = (siteUrl, tag) => (siteUrl ? `${siteUrl}/r/${encodeURIComponent(tag)}` : "");

export function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const formatCount = (value) => (value < 10000 ? Number(value || 0).toLocaleString("en-US") : compact.format(value));

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
export const formatDate = (iso) => (iso ? dateFormat.format(new Date(iso)) : "");

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

// Same rule as the server: the title's slug, with -2, -3 ... until it is free.
export function uniqueTag(source, taken) {
  const root = slugify(source);
  if (!root) return "";
  let candidate = root;
  for (let counter = 2; taken.has(candidate); counter += 1) {
    const suffix = `-${counter}`;
    candidate = root.slice(0, 64 - suffix.length) + suffix;
  }
  return candidate;
}

export const initialOf = (name) => (name || "?").trim().charAt(0).toUpperCase();
