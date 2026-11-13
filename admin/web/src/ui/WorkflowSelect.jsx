import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { workflowPath } from "../lib/workflow.js";
import { Select, Tip } from "./controls.jsx";

export function WorkflowSelect({ value, onChange, exclude, usage }) {
  const [workflows, setWorkflows] = useState(null);

  useEffect(() => {
    api("/api/workflows")
      .then(setWorkflows)
      .catch(() => setWorkflows([]));
  }, []);

  const allowed = (workflows || []).filter((w) => w.id !== exclude && (!usage || w.usage?.includes(usage)));
  const options = allowed.map((w) => ({ value: w.id, label: w.name }));
  const picked = workflows?.find((w) => w.id === value);
  const missing = value && workflows && !options.some((option) => option.value === value);
  // A picked workflow that was later unticked for this use stays visible, so the mismatch is obvious.
  if (missing) options.unshift({ value, label: picked ? `${picked.name} (${usage} is unticked in its Use for)` : "Deleted workflow" });

  return (
    <div className="workflow-select">
      <Select value={value || undefined} onChange={onChange} options={options} placeholder={workflows ? "Pick a workflow" : "Loading…"} aria-label="Workflow" />
      {value && picked && (
        <Tip label="Open this workflow in a new tab">
          <a className="row-icon" href={workflowPath(value)} target="_blank" rel="noopener noreferrer" aria-label="Open workflow">
            <ExternalLink size={16} strokeWidth={1.5} />
          </a>
        </Tip>
      )}
    </div>
  );
}
