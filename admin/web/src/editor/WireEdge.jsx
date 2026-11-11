import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";
import { portOf } from "../lib/workflow.js";
import { AddNodeMenu } from "./AddNodeMenu.jsx";
import { useEditor } from "./context.js";

const itemsLabel = (count) => `${count} ${count === 1 ? "item" : "items"}`;

export default function WireEdge({ id, source, target, sourceHandleId, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }) {
  const { exec, running, nodes, hoveredEdge, setHoveredEdge, addAfter, removeEdge } = useEditor();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const ran = !running && exec?.nodes?.[source]?.status === "success" && ["success", "error"].includes(exec?.nodes?.[target]?.status);
  const showTools = hoveredEdge === id || (selected && !nodes.some((n) => n.selected));
  const port = portOf(sourceHandleId);
  const count = !running && exec?.nodes?.[source]?.status === "success" ? exec.nodes[source].output?.[port]?.length ?? 0 : null;
  const className = ["wire", ran && "is-run", running && "is-live", selected && "is-selected"].filter(Boolean).join(" ");

  return (
    <>
      <BaseEdge id={id} path={path} className={className} interactionWidth={24} />
      <EdgeLabelRenderer>
        {count != null && !showTools && (
          <div className={`wire-count${count === 0 ? " is-empty" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {itemsLabel(count)}
          </div>
        )}
        <div
          className={`wire-tools nodrag nopan${showTools ? " is-visible" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onMouseEnter={() => setHoveredEdge(id)}
          onMouseLeave={() => setHoveredEdge(null)}
        >
          <AddNodeMenu onPick={(type) => addAfter(source, type, target, port)} side="bottom" align="center">
            <button type="button" aria-label="Insert a step here">
              <Plus size={14} strokeWidth={2} />
            </button>
          </AddNodeMenu>
          <button type="button" className="danger" aria-label="Remove connection" onClick={() => removeEdge(id)}>
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
