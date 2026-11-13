const { NODE_TYPES } = require("./nodes");

// Where a workflow may run: "delivery" (URL matching on /resolve, Visit and the videos server)
// and/or "pipeline" (pipeline steps and Run Workflow).
const USAGES = ["delivery", "pipeline"];

// Workflows saved before this setting existed were delivery workflows, unless they use pipeline-only steps.
function usageOf(workflow) {
  const value = workflow?.usage;
  const list = USAGES.filter((usage) => Array.isArray(value) && value.includes(usage));
  if (list.length) return list;
  return deliveryProblems(workflow).length ? ["pipeline"] : ["delivery"];
}

const usedFor = (workflow, usage) => usageOf(workflow).includes(usage);

// The videos server runs its own copy of the engine, which has neither the pipeline-only steps nor $env.
function deliveryProblems(workflow) {
  const problems = [];
  for (const node of workflow?.nodes || []) {
    const type = NODE_TYPES[node.type];
    if (type?.pipelineOnly) problems.push(`“${node.name}” is a ${type.label} step`);
    else if (node.type === "http" && node.params?.repeat) problems.push(`“${node.name}” uses Repeat until`);
    else if (JSON.stringify(node.params || {}).includes("$env")) problems.push(`“${node.name}” uses $env`);
  }
  return problems;
}

module.exports = { USAGES, usageOf, usedFor, deliveryProblems };
