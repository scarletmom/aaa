import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { KeyRound, Paperclip, Play, X } from "lucide-react";
import { incomingItems, isStale, previewScope } from "../lib/expr.js";
import { maskedEnv, useVariableNames } from "../lib/variables.js";
import { PATH_MIME } from "../ui/CodeField.jsx";
import { iconFor, outputPorts, stepReadiness } from "../lib/workflow.js";
import { Button, Segmented, Select, TextInput, Tip } from "../ui/controls.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { DataView } from "./DataView.jsx";
import { Params } from "./Params.jsx";
import { useEditor } from "./context.js";

const MODES = [
  { value: "tree", label: "Tree" },
  { value: "json", label: "JSON" },
];

function TypeIcon({ type }) {
  const Icon = iconFor(type);
  return (
    <span className="step-icon">
      <Icon size={18} strokeWidth={1.5} />
    </span>
  );
}

// Variables saved under Variables (and WF_ ones from .env), ready to drag into any field.
function VariablesShelf({ names }) {
  const { toast } = useFeedback();
  return (
    <div className="var-shelf">
      <div className="var-shelf-head">
        <KeyRound size={14} strokeWidth={1.75} />
        <span>Variables</span>
        <a href="/variables" target="_blank" rel="noopener noreferrer" className="var-shelf-link">
          Manage
        </a>
      </div>
      {names.length ? (
        <>
          <p className="col-hint">Drag into a field, or click to copy. Values stay hidden.</p>
          <div className="var-shelf-list">
            {names.map((name) => {
              const path = `$env.${name}`;
              return (
                <button
                  key={name}
                  type="button"
                  className="var-chip mono"
                  draggable
                  title={`{{ ${path} }}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", `{{ ${path} }}`);
                    e.dataTransfer.setData(PATH_MIME, path);
                  }}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(`{{ ${path} }}`)
                      .then(() => toast(`Copied {{ ${path} }}`))
                      .catch(() => toast("Couldn't copy", "error"))
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="col-hint">None yet. Add API keys and tokens under Variables.</p>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <div className="col-empty">{children}</div>;
}

const MAX_ITEMS = 100;
const itemsLabel = (count) => `${count} ${count === 1 ? "item" : "items"}`;

// One item renders as its fields; several render as a list, each keyed to $json because steps run per item.
function ItemsView({ items, basePath, mode }) {
  if (mode === "json") return <pre className="j-raw">{JSON.stringify(items.length === 1 ? items[0] : items, null, 2)}</pre>;
  if (items.length === 1) return <DataView value={items[0]} basePath={basePath} mode={mode} />;
  return (
    <div className="items">
      {items.slice(0, MAX_ITEMS).map((item, index) => (
        <details key={index} className="item" open={index < 3}>
          <summary>
            Item {index + 1}
          </summary>
          <DataView value={item} basePath={basePath} mode={mode} />
        </details>
      ))}
      {items.length > MAX_ITEMS && <p className="col-hint">{items.length - MAX_ITEMS} more items not shown</p>}
    </div>
  );
}

function InputColumn({ node, nodes, edges, exec, mode, setMode }) {
  const [sourceId, setSourceId] = useState(null);
  const parent = edges.find((e) => e.target === node.id)?.source;

  const sources = useMemo(() => {
    if (!exec) return [];
    const order = exec.order || [];
    const stop = order.indexOf(node.id);
    const earlier = (stop === -1 ? order : order.slice(0, stop))
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n) => n && n.id !== parent && exec.nodes[n.id]?.output?.flat().length)
      .map((n) => ({ id: n.id, name: n.data.name, base: `$node[${JSON.stringify(n.data.name)}].json`, items: exec.nodes[n.id].output.flat() }));
    const incoming = incomingItems(exec, edges, node.id);
    const parentNode = nodes.find((n) => n.id === parent);
    return parentNode && incoming.length ? [{ id: parent, name: parentNode.data.name, base: "$json", items: incoming }, ...earlier] : earlier;
  }, [exec, nodes, edges, node.id, parent]);

  if (node.data.type === "input") {
    const raw = exec?.nodes?.[node.id]?.input?.[0];
    return (
      <>
        <div className="col-head">
          <h3>Request</h3>
          <Segmented value={mode} onChange={setMode} options={MODES} />
        </div>
        {raw != null ? <DataView value={raw} basePath="$json" mode={mode} /> : <Empty>Run the workflow to see the request it receives</Empty>}
      </>
    );
  }

  const current = sources.find((s) => s.id === sourceId) || sources[0];
  const skipped = exec?.nodes?.[node.id]?.status === "skipped";
  return (
    <>
      <div className="col-head">
        <h3>Input</h3>
        {current && <span className="mono muted col-count">{itemsLabel(current.items.length)}</span>}
        {sources.length > 1 && (
          <Select
            size="sm"
            value={current.id}
            onChange={setSourceId}
            options={sources.map((s) => ({ value: s.id, label: s.name, hint: s.base === "$json" ? "$json" : null }))}
          />
        )}
        {current && <Segmented value={mode} onChange={setMode} options={MODES} />}
      </div>
      {current ? (
        <>
          <p className="col-hint">Drag a key into a field to reference it</p>
          <ItemsView items={current.items} basePath={current.base} mode={mode} />
        </>
      ) : (
        <Empty>{skipped ? "No items reached this step" : parent ? "Run the workflow to see what arrives here" : "Connect a step into this one"}</Empty>
      )}
    </>
  );
}

function OutputColumn({ node, exec, edges, mode, setMode }) {
  const [port, setPort] = useState(0);
  const record = exec?.nodes?.[node.id];
  const labels = outputPorts(node.data);
  const output = record?.output || [];
  const shownPort = labels ? Math.min(port, labels.length - 1) : 0;
  const items = labels ? output[shownPort] || [] : output.flat();
  const statusLabel = { success: "Success", error: "Failed", skipped: "Skipped" }[record?.status] || record?.status;

  return (
    <>
      <div className="col-head">
        <h3>Output</h3>
        {record && (
          <span className={`status status-${record.status}`}>
            <span className={`dot dot-${record.status}`} />
            {statusLabel}
            {record.status !== "skipped" && <span className="mono muted">{record.durationMs} ms</span>}
          </span>
        )}
        {items.length > 0 && <Segmented value={mode} onChange={setMode} options={MODES} />}
      </div>
      {labels && record?.status === "success" && (
        <div className="port-tabs">
          <Segmented
            value={String(shownPort)}
            onChange={(value) => setPort(Number(value))}
            options={labels.map((label, index) => ({ value: String(index), label: `${label} · ${output[index]?.length ?? 0}` }))}
          />
        </div>
      )}
      {!record ? (
        <Empty>{exec ? "This step did not run" : "Run the workflow to see this step's output"}</Empty>
      ) : record.status === "skipped" ? (
        <Empty>No items reached this step, so it did not run</Empty>
      ) : (
        <>
          {isStale(exec, edges, node.id) && <div className="stale-box">The step before this one has new output since this step ran. Run this step again to update it.</div>}
          {record.error && <div className="error-box">{record.error}</div>}
          {record.logs?.length > 0 && (
            <div className="logs">
              <span className="logs-label">Console</span>
              {record.logs.join("\n")}
            </div>
          )}
          {items.length > 0 ? (
            <>
              {items.length !== 1 && <p className="col-hint">{itemsLabel(items.length)}</p>}
              <ItemsView items={items} basePath={`$node[${JSON.stringify(node.data.name)}].json`} mode={mode} />
            </>
          ) : (
            !record.error && <Empty>{labels ? "No items went to this output" : "This step produced no items"}</Empty>
          )}
        </>
      )}
    </>
  );
}

const MAX_TEST_FILE_BYTES = 15 * 1024 * 1024;

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Picks a file for test runs; it arrives in the input as { data, mimeType, fileName, size }, like an upload to /hook.
function TestFiles({ fieldKeys }) {
  const { testFiles, setTestFiles } = useEditor();
  const { toast } = useFeedback();
  const [field, setField] = useState(fieldKeys[0] || "image");
  const inputRef = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    if (file.size > MAX_TEST_FILE_BYTES) return toast(`${file.name} is over the 15 MB limit`, "error");
    const key = field.trim() || "image";
    const data = await readFile(file);
    setTestFiles((current) => ({ ...current, [key]: { data, mimeType: file.type || "application/octet-stream", fileName: file.name, size: file.size } }));
  };

  return (
    <div className="field">
      <span className="field-label">Test files</span>
      <p className="col-hint">For test runs only, not saved. Real calls send files as multipart form data to /hook.</p>
      {Object.entries(testFiles).map(([key, file]) => (
        <div key={key} className="test-file">
          <Paperclip size={14} strokeWidth={1.75} />
          <span className="mono">{key}</span>
          <span className="test-file-name">{file.fileName}</span>
          <span className="muted mono">{Math.ceil(file.size / 1024)} KB</span>
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            aria-label={`Remove ${key}`}
            onClick={() => setTestFiles(({ [key]: _, ...rest }) => rest)}
          />
        </div>
      ))}
      <div className="test-file-add">
        <TextInput mono value={field} onChange={(e) => setField(e.target.value)} placeholder="field" aria-label="Field name" />
        <Button icon={Paperclip} onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]).catch((err) => toast(err.message, "error"));
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function NameInput({ node, onRename }) {
  const [draft, setDraft] = useState(node.data.name);
  useEffect(() => setDraft(node.data.name), [node.data.name]);
  const commit = () => (draft.trim() && draft !== node.data.name ? onRename(draft.trim()) : setDraft(node.data.name));
  return (
    <input
      className="panel-name"
      value={draft}
      spellCheck={false}
      aria-label="Step name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function NodePanel({ nodeId, onClose, meta, setMeta }) {
  const { types, exec, nodes, edges, runStep, running, setParam, remapPorts, renameNode } = useEditor();
  const [mode, setMode] = useState("tree");
  const node = nodes.find((n) => n.id === nodeId);
  const type = node && types[node.data.type];
  const variableNames = useVariableNames();
  const scope = useMemo(() => {
    const base = node && previewScope({ exec, nodes, edges, nodeId: node.id });
    return base && { ...base, $env: maskedEnv(variableNames) };
  }, [exec, nodes, edges, node, variableNames]);
  // "Stop when" and other deferred fields preview against this step's own last response.
  const ownResponse = exec?.nodes?.[node?.id]?.output?.[0]?.[0];
  const deferredScope = useMemo(() => (scope && ownResponse ? { ...scope, $response: ownResponse, $attempt: ownResponse.attempts ?? 1 } : null), [scope, ownResponse]);
  const readiness = useMemo(() => (node ? stepReadiness({ exec, nodes, edges, nodeId: node.id }) : { ready: false }), [exec, nodes, edges, node]);

  return (
    <Dialog.Root open={Boolean(node)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        {node && type && (
          <Dialog.Content
            className="panel"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              e.currentTarget.focus();
            }}
          >
            <header className="panel-head">
              <TypeIcon type={node.data.type} />
              <Dialog.Title asChild>
                <NameInput node={node} onRename={(name) => renameNode(node.id, name)} />
              </Dialog.Title>
              {type.label !== node.data.name && <span className="panel-type">{type.label}</span>}
              <div className="spacer" />
              <Tip label={readiness.ready ? (node.data.type === "input" ? "Run this step with the test input" : "Run only this step, on what the step before it sent last time") : readiness.reason}>
                <span>
                  <Button variant="primary" icon={Play} loading={running} disabled={!readiness.ready} onClick={() => runStep(node.id)}>
                    Run step
                  </Button>
                </span>
              </Tip>
              <Dialog.Close asChild>
                <Button variant="ghost" icon={X} aria-label="Close" />
              </Dialog.Close>
            </header>
            <div className="panel-body">
              <section className="col">
                <InputColumn node={node} nodes={nodes} edges={edges} exec={exec} mode={mode} setMode={setMode} />
                <VariablesShelf names={variableNames} />
              </section>
              <section className="col col-params">
                <div className="col-head">
                  <h3>Parameters</h3>
                </div>
                <p className="col-hint">{type.description}</p>
                {node.data.type === "input" && (
                  <div className="field">
                    <span className="field-label">Webhook path</span>
                    <div className="field-box text-input prefixed mono">
                      <span className="muted">/hook/</span>
                      <input value={meta.slug || ""} spellCheck={false} onChange={(e) => setMeta({ slug: e.target.value })} />
                    </div>
                  </div>
                )}
                {node.data.type === "input" && <TestFiles fieldKeys={(node.data.params.fields || []).map((f) => f.key).filter(Boolean)} />}
                <Params node={node} type={type} scope={scope} deferredScope={deferredScope} workflowId={meta.id} onParam={(name, value) => setParam(node.id, name, value)} onRemapPorts={(map) => remapPorts(node.id, map)} />
              </section>
              <section className="col">
                <OutputColumn node={node} exec={exec} edges={edges} mode={mode} setMode={setMode} />
              </section>
            </div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

