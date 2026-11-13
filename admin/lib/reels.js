const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ffmpeg = require("./ffmpeg");
const storage = require("./storage");
const { usageOf } = require("./usage");

const FEATURE = "Reel to post";

// Fixed ids, so the Reel to post page finds its workflows by id on every database and a rename never breaks it.
const STEPS = {
  download: {
    id: "reel-download",
    name: "Reel · Download video",
    fields: [{ key: "url", value: "", required: true }],
    testInput: { url: "https://www.instagram.com/reel/XXXXXXXXXXX/" },
    returns: "{ url } where url is the .mp4 (a Save File result works too)",
    output: [{ key: "url", value: "{{ $json.url }}" }],
  },
  facedigger: {
    id: "reel-facedigger",
    name: "Reel · FaceDigger",
    fields: [{ key: "image", value: "", required: true }],
    testInput: { image: "https://example.com/frame.jpg" },
    returns: '{ cams: { results: [{ url, title, thumbnail, similarity }] }, <tag>: { results: [...] } }',
    output: [],
  },
  thumbnail: {
    id: "reel-thumbnail",
    name: "Reel · Upload thumbnail",
    fields: [{ key: "image", value: "", required: true }],
    testInput: { image: "https://example.com/frame.jpg" },
    returns: "{ url } where url is the uploaded .jpg/.png",
    output: [{ key: "url", value: "{{ $json.url }}" }],
  },
  post: {
    id: "reel-post",
    name: "Reel · Create post",
    fields: [
      { key: "title", value: "", required: true },
      { key: "description", value: "", required: true },
      { key: "realUrl", value: "", required: true },
      { key: "thumbnail", value: "" },
      { key: "category", value: "" },
      { key: "duration", value: "" },
      { key: "postTag", value: "" },
    ],
    testInput: { title: "Test post", description: "Test description", realUrl: "https://example.com/video.mp4" },
    returns: "the created post, with postTag",
    wired: true,
  },
  notify: {
    id: "reel-notify",
    name: "Reel · Telegram notification",
    fields: [
      { key: "videoUrl", value: "", required: true },
      { key: "message", value: "", required: true },
      { key: "linkName", value: "Watch now", required: true },
      { key: "linkUrl", value: "", required: true },
      { key: "video", value: "" },
    ],
    testInput: { videoUrl: "https://example.com/reel.mp4", message: "New video", linkName: "Watch now", linkUrl: "https://example.com/r/test" },
    returns: "anything; a successful run counts as sent",
    output: [],
  },
};

const LOCKED_IDS = new Set(Object.values(STEPS).map((step) => step.id));
const lockReason = (id) => (LOCKED_IDS.has(id) ? FEATURE : null);

const inputNode = (step) => ({
  id: "in",
  type: "input",
  name: "Input",
  position: [80, 200],
  params: {
    fields: step.fields,
    urlField: step.fields.some((field) => field.key === "url") ? "url" : "",
    matchType: "none",
    matchValue: "",
    cacheSeconds: 0,
    onError: "error",
    testInput: JSON.stringify(step.testInput, null, 2),
  },
});

// A step that fails loudly until it is replaced, so an unwired workflow never looks like it worked.
const placeholderNode = (step) => ({
  id: "todo",
  type: "code",
  name: "Wire me",
  position: [360, 200],
  params: {
    mode: "each",
    code: `// Replace this step with your own steps.\n// The Output step must return ${step.returns}.\nthrow new Error(${JSON.stringify(`“${step.name}” isn't wired yet. Open it under Workflows and replace the “Wire me” step.`)});\n`,
    timeoutMs: 5000,
  },
});

function definitionFor(step) {
  if (step.wired) {
    return {
      nodes: [
        inputNode(step),
        {
          id: "post",
          type: "post",
          name: "Create Post",
          position: [360, 200],
          params: {
            title: "{{ $json.title }}",
            description: "{{ $json.description }}",
            realUrl: "{{ $json.realUrl }}",
            thumbnail: "{{ $json.thumbnail }}",
            category: "{{ $json.category }}",
            duration: "{{ $json.duration }}",
            postTag: "{{ $json.postTag }}",
          },
        },
        { id: "out", type: "respond", name: "Output", position: [640, 200], params: { mode: "json", items: "first", fields: [], status: 0 } },
      ],
      connections: [
        { from: "in", to: "post" },
        { from: "post", to: "out" },
      ],
    };
  }
  return {
    nodes: [
      inputNode(step),
      placeholderNode(step),
      { id: "out", type: "respond", name: "Output", position: [640, 200], params: { mode: "json", items: "first", fields: step.output, status: 0 } },
    ],
    connections: [
      { from: "in", to: "todo" },
      { from: "todo", to: "out" },
    ],
  };
}

// Creates the workflows that are missing and never touches existing ones, so it's safe to run again.
async function ensureReelWorkflows(store) {
  const created = [];
  const existing = [];
  for (const step of Object.values(STEPS)) {
    if (store.get(step.id)) {
      existing.push(step.name);
      continue;
    }
    await store.save({ name: step.name, active: false, usage: ["pipeline"], ...definitionFor(step) }, step.id);
    created.push(step.name);
  }
  return { created, existing };
}

function status(store) {
  return Object.fromEntries(
    Object.entries(STEPS).map(([key, step]) => {
      const workflow = store.get(step.id);
      return [key, { id: step.id, name: workflow?.name || step.name, exists: Boolean(workflow), inputs: step.fields.map((field) => field.key) }];
    })
  );
}

// Locked workflows must stay callable from the page, so Pipeline can't be unticked.
function saveProblem(id, input) {
  if (!LOCKED_IDS.has(id)) return null;
  return usageOf(input).includes("pipeline") ? null : `This workflow is used by ${FEATURE}, so Pipeline must stay ticked under Use for.`;
}

const MAX_FRAME_WIDTH = 1920;

// Server-side fallback for a frame the browser can't read from a cross-origin video.
async function grabFrame(video, time) {
  const text = String(video || "").trim();
  let source;
  if (text.startsWith("/media/")) {
    const relative = decodeURIComponent(text.slice("/media/".length).split(/[?#]/)[0]);
    source = storage.absolutePath(relative);
  } else if (/^https?:\/\//i.test(text)) {
    source = text;
  } else {
    throw new Error("Video must be an http(s) URL or a /media/ file");
  }
  const seconds = Math.max(Number(time) || 0, 0);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "reel-frame-"));
  try {
    const target = path.join(dir, "frame.jpg");
    await ffmpeg.withLocalSource(source, {}, (local) => ffmpeg.frame(local, target, { time: seconds, width: MAX_FRAME_WIDTH, timeoutMs: 60000 }));
    const buffer = await fs.promises.readFile(target);
    return { data: buffer.toString("base64"), mimeType: "image/jpeg", fileName: `frame-${seconds.toFixed(1)}s.jpg`, size: buffer.length };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { FEATURE, STEPS, lockReason, ensureReelWorkflows, status, saveProblem, grabFrame };
