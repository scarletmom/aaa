const store = require("../store");
const reels = require("../reels");
const { runWorkflow } = require("../engine");
const { responseValue } = require("../nodes");
const { loadFile } = require("../files");
const teraboxVideos = require("./teraboxVideos");

// Imported thumbnails are re-hosted through the same "Upload thumbnail" workflow Reel to post uses.
const WORKFLOW_ID = reels.STEPS.thumbnail.id;
const CONCURRENCY = 3;
// An unwired or broken workflow fails every upload; stop instead of trying thousands of them.
const MAX_FAILURES_IN_A_ROW = 10;
const RESULT_KEYS = ["url", "thumbnail", "link", "image", "file", "result"];

const queue = [];
const progress = { queued: 0, uploaded: 0, failed: 0, lastError: "", stopped: false };
let running = 0;
let failuresInARow = 0;

const httpUrl = (value) => (typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "");

function hostedUrlOf(result) {
  if (!result || typeof result !== "object") return "";
  for (const key of RESULT_KEYS) {
    const value = result[key];
    const url = httpUrl(value && typeof value === "object" ? value.url : value);
    if (url) return url;
  }
  return "";
}

async function rehost({ key, thumbnail }) {
  const workflow = store.get(WORKFLOW_ID);
  if (!workflow) throw new Error(`The “${reels.STEPS.thumbnail.name}” workflow doesn't exist yet. Run npm run workflows:setup.`);
  const { buffer, mimeType, fileName } = await loadFile(thumbnail, { timeoutMs: 20000 });
  if (!mimeType.startsWith("image/")) throw new Error(`${thumbnail} isn't an image (${mimeType})`);

  const image = { data: buffer.toString("base64"), mimeType, fileName, size: buffer.length };
  const execution = await runWorkflow(workflow, { image }, { mode: "terabox-import" });
  if (execution.status !== "success") {
    store.record(execution);
    throw new Error(`${execution.error?.nodeName ? `${execution.error.nodeName}: ` : ""}${execution.error?.message || "the upload failed"}`);
  }
  const hosted = hostedUrlOf(responseValue(execution.response));
  if (!hosted) throw new Error("The upload workflow finished but returned no image URL. Its Output step must return { url }.");
  await teraboxVideos.replaceThumbnail(key, thumbnail, hosted);
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift();
    running += 1;
    rehost(job)
      .then(() => {
        progress.uploaded += 1;
        failuresInARow = 0;
      })
      .catch((err) => {
        progress.failed += 1;
        progress.lastError = err.message;
        console.error(`terabox thumbnail ${job.key}: ${err.message}`);
        if (++failuresInARow >= MAX_FAILURES_IN_A_ROW) {
          progress.failed += queue.length;
          queue.length = 0;
          progress.stopped = true;
        }
      })
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}

/** Queues each video's thumbnail for upload; the row keeps the original URL until its upload succeeds. */
function enqueue(videos) {
  const jobs = videos.filter((video) => video.thumbnail).map(({ key, thumbnail }) => ({ key, thumbnail }));
  if (!jobs.length) return 0;
  if (!running && !queue.length) Object.assign(progress, { queued: 0, uploaded: 0, failed: 0, lastError: "", stopped: false });
  failuresInARow = 0;
  progress.stopped = false;
  queue.push(...jobs);
  progress.queued += jobs.length;
  pump();
  return jobs.length;
}

function status() {
  return { ...progress, pending: queue.length + running };
}

module.exports = { enqueue, status };
