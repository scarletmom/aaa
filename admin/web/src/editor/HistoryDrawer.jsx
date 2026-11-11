import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { api } from "../lib/api.js";
import { relativeTime } from "../lib/workflow.js";
import { Button } from "../ui/controls.jsx";

const MODE_LABELS = { manual: "Editor", webhook: "Webhook", resolve: "Resolve", visit: "Content visit", step: "Single step" };

export function HistoryDrawer({ workflowId, currentId, refreshKey, onPick, onClose }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api(`/api/workflows/${workflowId}/executions`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [workflowId, refreshKey]);

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>History</h3>
        <span className="muted mono">{rows?.length ?? ""}</span>
        <div className="spacer" />
        <Button variant="ghost" size="sm" icon={RefreshCw} aria-label="Refresh" loading={loading} onClick={load} />
        <Button variant="ghost" size="sm" icon={X} aria-label="Close history" onClick={onClose} />
      </div>
      <div className="drawer-list">
        {rows?.length === 0 && <div className="col-empty">Runs from the editor, /hook and /resolve show up here</div>}
        {rows?.map((row) => (
          <button key={row.id} type="button" className={`run-row${row.id === currentId ? " is-current" : ""}`} onClick={() => onPick(row.id)}>
            <span className="run-row-top">
              <span className={`dot dot-${row.status}`} />
              <span>{new Date(row.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              <span className="muted">{relativeTime(row.startedAt)}</span>
              <span className="spacer" />
              <span className="mono muted">{row.durationMs} ms</span>
            </span>
            <span className="run-row-meta">{MODE_LABELS[row.mode] || row.mode}</span>
            {row.error && <span className="run-row-err">{row.error}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}
