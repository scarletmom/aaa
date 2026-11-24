const { definitionFor } = require("./reels");
const { usageOf } = require("./usage");

const FEATURE = "Terabox";

// A fixed id, so the videos site's Terabox page finds this workflow on every database and a rename never breaks it.
const STEP = {
  id: "terabox-video",
  name: "Terabox · Get video",
  fields: [
    { key: "url", value: "", required: true },
    { key: "data", value: "" },
  ],
  testInput: { url: "https://1024terabox.com/s/1XXXXXXXXXXXXXXXXXXXXXX", data: "" },
  returns: '{ title, thumbnail, qualities: { "720p": url, … } or [{ label, url }] }',
  output: [
    { key: "title", value: "{{ $json.title }}" },
    { key: "thumbnail", value: "{{ $json.thumbnail }}" },
    { key: "qualities", value: "{{ $json.qualities }}" },
  ],
};

const lockReason = (id) => (id === STEP.id ? FEATURE : null);

// Must stay callable by id, so Pipeline can't be unticked.
function saveProblem(id, input) {
  if (id !== STEP.id) return null;
  return usageOf(input).includes("pipeline") ? null : `This workflow is used by ${FEATURE}, so Pipeline must stay ticked under Use for.`;
}

// Creates the workflow if it's missing and never touches an existing one, so it's safe to run again.
async function ensureTeraboxWorkflow(store) {
  if (store.get(STEP.id)) return { created: [], existing: [STEP.name] };
  await store.save({ name: STEP.name, active: false, usage: ["pipeline"], ...definitionFor(STEP) }, STEP.id);
  return { created: [STEP.name], existing: [] };
}

module.exports = { FEATURE, STEP, lockReason, saveProblem, ensureTeraboxWorkflow };
