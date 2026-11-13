const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

// FFMPEG_PATH/FFPROBE_PATH win; then the binaries from ffmpeg-static/ffprobe-static, for hosts like Render
// where ffmpeg can't be installed system-wide; then whatever is on PATH.
function binary(envName, packageName, fallback) {
  if (process.env[envName]) return process.env[envName];
  try {
    const found = require(packageName);
    const file = typeof found === "string" ? found : found?.path;
    if (file && fs.existsSync(file)) return file;
  } catch {}
  return fallback;
}

const FFMPEG = binary("FFMPEG_PATH", "ffmpeg-static", "ffmpeg");
const FFPROBE = binary("FFPROBE_PATH", "ffprobe-static", "ffprobe");
const STDERR_TAIL = 2000;

function run(bin, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} took longer than ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-STDERR_TAIL)));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new Error(`${bin} is not installed on the server. Install ffmpeg, or set FFMPEG_PATH and FFPROBE_PATH in .env`) : err);
    });
    // A null code means a signal ended it: SIGKILL is usually the memory limit, SIGSEGV or SIGILL a binary that crashed.
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdout);
      const name = path.basename(bin);
      const detail = stderr.trim().split("\n").slice(-3).join(" ");
      const reason = signal ? `was stopped by ${signal}${signal === "SIGKILL" ? " (often the server running out of memory)" : ""}` : `failed with exit code ${code}`;
      reject(new Error(`${name} ${reason}${detail ? `: ${detail}` : ""}`));
    });
  });
}

// ffmpeg takes extra request headers as one CRLF-joined string.
const headerArgs = (headers) => {
  const lines = Object.entries(headers || {}).map(([key, value]) => `${key}: ${value}`);
  return lines.length ? ["-headers", `${lines.join("\r\n")}\r\n`] : [];
};

async function duration(source, { headers, timeoutMs = 30000 } = {}) {
  const out = await run(FFPROBE, ["-v", "error", ...headerArgs(headers), "-show_entries", "format=duration", "-of", "csv=p=0", source], { timeoutMs });
  const seconds = Number.parseFloat(out.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

// Copies an HLS (or any ffmpeg-readable) stream into one MP4 without re-encoding.
function remux(source, target, { headers, timeoutMs }) {
  return run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...headerArgs(headers), "-i", source, "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart", target], {
    timeoutMs,
  });
}

function frame(source, target, { time, width, headers, timeoutMs }) {
  return run(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-y", "-ss", time.toFixed(2), ...headerArgs(headers), "-i", source, "-frames:v", "1", "-vf", `scale='min(${width},iw)':-2`, "-q:v", "3", target],
    { timeoutMs }
  );
}

const ENCODERS = { jpeg: "mjpeg", webp: "libwebp", png: "png" };

// Fits the image inside maxWidth × maxHeight without enlarging it or changing its proportions.
function resizeImage(source, target, { maxWidth, maxHeight, format, quality, timeoutMs = 30000 }) {
  const scale = `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`;
  const level = Math.min(Math.max(Number(quality) || 75, 1), 100);
  // mjpeg's -q:v runs from 2 (best) to 31 (smallest); libwebp takes 0-100 directly.
  const qualityArgs = format === "jpeg" ? ["-q:v", String(Math.round(2 + ((100 - level) * 29) / 99))] : format === "webp" ? ["-quality", String(level)] : [];
  return run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", scale, "-frames:v", "1", "-c:v", ENCODERS[format], ...qualityArgs, target], { timeoutMs });
}

async function imageSize(file) {
  const out = await run(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { timeoutMs: 10000 });
  const [width, height] = out.trim().split(",").map(Number);
  return { width: width || null, height: height || null };
}

const HLS_URL = /\.m3u8(\?|#|$)/i;
const MAX_DOWNLOAD_BYTES = 500 * 1048576;

function byteLimit(maxBytes) {
  let seen = 0;
  return new Transform({
    transform(chunk, encoding, done) {
      seen += chunk.length;
      done(seen > maxBytes ? new Error(`Video is over the ${Math.round(maxBytes / 1048576)} MB limit`) : null, chunk);
    },
  });
}

// Video hosts often refuse Node's default request ("node" user agent), so ask like a browser would,
// and uncompressed, so Content-Length still matches what's streamed on.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
};

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// fetch() only says "fetch failed"; the reason (DNS, refused, reset, TLS) sits in err.cause, so name it and the host.
function connectionError(url, err) {
  if (err.name === "TimeoutError") return new Error(`${hostOf(url)} didn't answer in time`);
  const cause = err.cause?.cause || err.cause;
  const code = cause?.code ? `${cause.code}: ` : "";
  return new Error(`The admin server couldn't connect to ${hostOf(url)} (${code}${cause?.message || err.message})`);
}

async function fetchVideo(url, { headers, signal } = {}) {
  try {
    return await fetch(url, { headers: { ...BROWSER_HEADERS, ...headers }, redirect: "follow", signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    const described = connectionError(url, err);
    console.error(`video fetch: ${described.message}`);
    throw described;
  }
}

// Static Linux ffmpeg builds (ffmpeg-static on Render) segfault when they look up a hostname, so Node fetches
// remote videos to a temp file and ffmpeg only ever reads local files. HLS playlists still go to ffmpeg directly.
async function withLocalSource(source, { headers, timeoutMs = 120000 } = {}, work) {
  const text = String(source);
  if (!/^https?:\/\//i.test(text) || HLS_URL.test(text)) return work(source);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ffmpeg-src-"));
  try {
    const res = await fetchVideo(text, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok || !res.body) throw new Error(`${hostOf(text)} answered HTTP ${res.status} to the admin server`);
    const file = path.join(dir, "source");
    await pipeline(Readable.fromWeb(res.body), byteLimit(MAX_DOWNLOAD_BYTES), fs.createWriteStream(file));
    return await work(file);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

// Runs `-version` on both binaries, for checking a server's setup from the admin.
async function check() {
  const probe = async (bin) => {
    const exists = !path.isAbsolute(bin) || fs.existsSync(bin);
    const size = exists && path.isAbsolute(bin) ? fs.statSync(bin).size : null;
    try {
      const out = await run(bin, ["-hide_banner", "-version"], { timeoutMs: 15000 });
      return { path: bin, size, ok: true, version: out.split("\n")[0] };
    } catch (err) {
      return { path: bin, size, ok: false, error: err.message };
    }
  };
  return { ffmpeg: await probe(FFMPEG), ffprobe: await probe(FFPROBE) };
}

module.exports = { FFMPEG, FFPROBE, check, fetchVideo, withLocalSource, duration, remux, frame, resizeImage, imageSize };
