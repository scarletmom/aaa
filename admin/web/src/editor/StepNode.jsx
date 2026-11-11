import { memo, useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { CircleAlert, Check, LoaderCircle, Play, Plus, SquarePen, Trash2 } from "lucide-react";
import { iconFor, outputPorts, portOf, stepReadiness, subtitle } from "../lib/workflow.js";
import { Tip } from "../ui/controls.jsx";
import { AddNodeMenu } from "./AddNodeMenu.jsx";
import { useEditor } from "./context.js";

const itemsLabel = (count) => `${count} ${count === 1 ? "item" : "items"}`;

// Lives inside the output handle, so dragging the wire or the + starts a connection; a click opens the menu.
function AddStub({ onPick }) {
  return (
    <span className="step-add">
      <span className="step-add-wire" />
      <AddNodeMenu onPick={onPick}>
        <button type="button" className="step-add-btn" aria-label="Add a step after this one">
          <Plus size={14} strokeWidth={2} />
        </button>
      </AddNodeMenu>
    </span>
  );
}

function StepNode({ id, data, selected }) {
  const { types, exec, running, runningStep, nodes, edges, addAfter, removeNode, openPanel, runStep } = useEditor();
  const updateNodeInternals = useUpdateNodeInternals();
  const type = types[data.type] || { label: data.type, inputs: true, outputs: true, params: [] };
  const Icon = iconFor(data.type);
  const record = exec?.nodes?.[id];
  const status = running ? null : record?.status;
  const sub = subtitle(type, data.params) || (data.type === "input" ? "Webhook trigger" : type.label);
  const ports = type.outputs ? outputPorts(data) : null;
  const portsKey = ports?.join("|") ?? "";
  const usedPorts = new Set(edges.filter((edge) => edge.source === id).map((edge) => portOf(edge.sourceHandle)));
  const firstFree = ports ? Math.max(0, ports.findIndex((_, i) => !usedPorts.has(i))) : 0;
  const outCount = record?.output?.flat().length ?? 0;
  const readiness = stepReadiness({ exec, nodes, edges, nodeId: id });
  const runLabel = readiness.ready ? (data.type === "input" ? "Run this step with the test input" : "Run only this step") : readiness.reason;

  useEffect(() => updateNodeInternals(id), [id, portsKey, updateNodeInternals]);

  return (
    <div className={`step${selected ? " is-selected" : ""}${status ? ` is-${status}` : ""}${ports ? " has-ports" : ""}`} title={record?.error || undefined}>
      <div className="step-head">
        {type.inputs && <Handle type="target" position={Position.Left} className="port" />}
        <span className="step-icon">
          <Icon size={18} strokeWidth={1.5} />
        </span>
        <span className="step-body">
          <span className="step-name">{data.name}</span>
          <span className="step-sub">{sub}</span>
        </span>
        {type.outputs && !ports && (
          <>
            <Handle type="source" id="out-0" position={Position.Right} className="port">
              {!usedPorts.has(0) && <AddStub onPick={(next) => addAfter(id, next, undefined, 0)} />}
            </Handle>
          </>
        )}
      </div>

      {ports && (
        <div className="step-ports">
          {ports.map((label, index) => (
            <div key={index} className="step-port">
              <span className="step-port-label">{label}</span>
              {status === "success" && <span className="step-port-count">{record.output?.[index]?.length ?? 0}</span>}
              <Handle type="source" id={`out-${index}`} position={Position.Right} className="port">
                {!usedPorts.has(index) && <AddStub onPick={(next) => addAfter(id, next, undefined, index)} />}
              </Handle>
            </div>
          ))}
        </div>
      )}

      {status && status !== "skipped" && (
        <span className="step-status">
          {status === "error" ? <CircleAlert size={12} strokeWidth={2} /> : <Check size={12} strokeWidth={2.25} />}
          <span>
            {status === "success" && outCount !== 1 ? `${itemsLabel(outCount)} · ` : ""}
            {record.durationMs} ms
          </span>
        </span>
      )}
      {status === "skipped" && <span className="step-status is-skipped">No items reached this step</span>}

      <span className="step-actions nodrag">
        <Tip label={runLabel} side="top">
          {/* aria-disabled rather than disabled, so the tooltip can still explain why */}
          <button
            type="button"
            aria-label="Run this step"
            aria-disabled={!readiness.ready || running}
            onClick={() => readiness.ready && !running && runStep(id)}
          >
            {runningStep === id ? <LoaderCircle className="spin" size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={1.75} />}
          </button>
        </Tip>
        {type.outputs && (
          <AddNodeMenu onPick={(next) => addAfter(id, next, undefined, firstFree)} side="top" align="center">
            <Tip label="Add step after" side="top">
              <button type="button" aria-label="Add a step after this one">
                <Plus size={14} strokeWidth={2} />
              </button>
            </Tip>
          </AddNodeMenu>
        )}
        <Tip label="Open" side="top">
          <button type="button" aria-label="Open" onClick={() => openPanel(id)}>
            <SquarePen size={14} strokeWidth={1.75} />
          </button>
        </Tip>
        {data.type !== "input" && (
          <Tip label="Delete" keys={["⌫"]} side="top">
            <button type="button" className="danger" aria-label="Delete" onClick={() => removeNode(id)}>
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </Tip>
        )}
      </span>
    </div>
  );
}

export default memo(StepNode);
