const fs = require("node:fs");
const { spawn } = require("node:child_process");

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
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} failed: ${stderr.trim().split("\n").slice(-3).join(" ") || `exit code ${code}`}`));
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

module.exports = { FFMPEG, FFPROBE, duration, remux, frame, resizeImage, imageSize };
