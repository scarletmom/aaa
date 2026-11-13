import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useKeyPress,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { ArrowLeft, Copy, CopyPlus, Ellipsis, History, Lock, LogOut, Maximize, Minus, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useUnsavedChanges } from "../lib/unsaved.js";
import { api, loadTypes, signOut } from "../lib/api.js";
import { GAP_X, deliveryBlockers, usageOf, defaultParams, fromFlow, isAncestor, newId, portCount, portOf, renameRefs, toFlow, uniqueName, wire, workflowPath } from "../lib/workflow.js";
import { Button, Switch, Tip } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { EditorContext } from "../editor/context.js";
import StepNode from "../editor/StepNode.jsx";
import WireEdge from "../editor/WireEdge.jsx";
import { AddNodeMenu } from "../editor/AddNodeMenu.jsx";
import { NodePanel } from "../editor/NodePanel.jsx";
import { HistoryDrawer } from "../editor/HistoryDrawer.jsx";
import { UsagePicker } from "../editor/UsagePicker.jsx";

const nodeTypes = { step: StepNode };
const edgeTypes = { wire: WireEdge };
const BRANCH_Y = 120;
const PASTE_OFFSET = 40;
const DUPLICATE_OFFSET_Y = 100;
const CLIPBOARD_KIND = "linkproxy/steps";
const PAN_BUTTONS = [1, 2];
const FIT = { padding: 0.25, maxZoom: 1 };

const isTyping = (target) => Boolean(target.closest?.("input, textarea, [contenteditable], .cm-editor, [role=dialog], [role=menu]"));

function descendants(edges, roots) {
  const found = new Set();
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift();
    if (found.has(id)) continue;
    found.add(id);
    for (const edge of edges) if (edge.source === id) queue.push(edge.target);
  }
  return found;
}

// The Input step is unique per workflow, so it never travels through the clipboard.
function clipboardPayload(nodes, edges) {
  const picked = nodes.filter((n) => n.selected && n.data.type !== "input");
  if (!picked.length) return null;
  const ids = new Set(picked.map((n) => n.id));
  return {
    kind: CLIPBOARD_KIND,
    nodes: picked.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    connections: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ from: e.source, to: e.target, output: portOf(e.sourceHandle) })),
  };
}

function readPayload(text) {
  try {
    const payload = JSON.parse(text);
    return payload?.kind === CLIPBOARD_KIND && Array.isArray(payload.nodes) ? payload : null;
  } catch {
    return null;
  }
}

const plural = (count) => `${count} ${count === 1 ? "step" : "steps"}`;

function SelectionBar({ count, onCopy, onDuplicate, onDelete, onClear }) {
  return (
    <div className="selection-bar">
      <span className="selection-count">{plural(count)} selected</span>
      <span className="topbar-divider" />
      <Tip label="Copy" keys={["⌘", "C"]} side="top">
        <Button variant="ghost" size="sm" icon={Copy} onClick={onCopy}>
          Copy
        </Button>
      </Tip>
      <Tip label="Duplicate" keys={["⌘", "D"]} side="top">
        <Button variant="ghost" size="sm" icon={CopyPlus} onClick={onDuplicate}>
          Duplicate
        </Button>
      </Tip>
      <Tip label="Delete" keys={["⌫"]} side="top">
        <Button variant="ghost" size="sm" icon={Trash2} className="danger-ghost" onClick={onDelete}>
          Delete
        </Button>
      </Tip>
      <Tip label="Clear selection" keys={["Esc"]} side="top">
        <Button variant="ghost" size="sm" icon={X} aria-label="Clear selection" onClick={onClear} />
      </Tip>
    </div>
  );
}

function describeResponse(response) {
  if (!response) return "";
  if (response.mode === "redirect") return `${response.status} → ${response.url}`;
  if (response.mode === "text") return String(response.body);
  return JSON.stringify(response.body);
}

function RunCard({ exec, stepName, onOpen, onClear }) {
  const step = exec.mode === "step" ? exec.nodes[exec.step] : null;
  const failed = step ? step.status === "error" : exec.status === "error";
  const text = step ? (failed ? step.error : JSON.stringify(step.output?.flat()[0] ?? null)) : failed ? exec.error.message : describeResponse(exec.response);
  const target = step ? exec.step : failed ? exec.error.nodeId : exec.order.at(-1);
  const label = step ? `${stepName || "Step"} ${failed ? "failed" : "ran"} on its own` : failed ? `Failed at ${exec.error.nodeName || "start"}` : "Success";
  return (
    <div className={`run-card${failed ? " is-error" : ""}`}>
      <span className={`dot dot-${failed ? "error" : "success"}`} />
      <span className="run-card-label">{label}</span>
      <button type="button" className="run-card-result" title={text} onClick={() => target && onOpen(target)}>
        {text}
      </button>
      <span className="mono muted">{exec.durationMs} ms</span>
      <Button variant="ghost" size="sm" icon={X} aria-label="Clear result" onClick={onClear} />
    </div>
  );
}

function WorkflowEditor({ id }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm, toast } = useFeedback();
  const { getNodes, getEdges, zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow();

  const [types, setTypes] = useState(null);
  const [meta, setMetaState] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [exec, setExec] = useState(null);
  const [running, setRunning] = useState(false);
  const [runningStep, setRunningStep] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Test files picked on the Input step: kept in the browser only, never saved with the workflow.
  const [testFiles, setTestFiles] = useState({});
  const [panelId, setPanelId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const nameRef = useRef(null);
  const canvasRef = useRef(null);
  const clipboardRef = useRef(null);
  const pointerRef = useRef(null);
  const pasteCountRef = useRef(0);
  const spaceHeld = useKeyPress("Space");
  const nodesReady = useNodesInitialized();
  const fittedRef = useRef(false);

  // Fit once every step has been measured; multi-output steps are taller than the default guess.
  useEffect(() => {
    if (!nodesReady || fittedRef.current) return;
    fittedRef.current = true;
    requestAnimationFrame(() => fitView(FIT));
  }, [nodesReady]);

  useEffect(() => {
    Promise.all([loadTypes(), api(`/api/workflows/${id}`)])
      .then(([loadedTypes, workflow]) => {
        const { nodes: wfNodes, connections, ...rest } = workflow;
        const flow = toFlow(workflow);
        setTypes(loadedTypes);
        setMetaState(rest);
        setNodes(flow.nodes);
        setEdges(flow.edges);
      })
      .catch((err) => {
        toast(err.message === "Not found" ? "That workflow no longer exists" : err.message, "error");
        navigate("/workflows", { replace: true });
      });
  }, [id]);

  useEffect(() => {
    if (meta && location.state?.rename) {
      nameRef.current?.focus();
      nameRef.current?.select();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [meta]);


  const touch = () => setDirty(true);
  const setMeta = (patch) => {
    setMetaState((current) => ({ ...current, ...patch }));
    touch();
  };

  const snapshot = () => fromFlow(meta, getNodes(), getEdges());

  // Shrinking a Switch or Filter's outputs drops the wires that hung off the removed ports.
  const setParam = useCallback((nodeId, name, value) => {
    const node = getNodes().find((n) => n.id === nodeId);
    if (!node) return;
    const data = { ...node.data, params: { ...node.data.params, [name]: value } };
    const ports = portCount(data);
    setNodes((list) => list.map((n) => (n.id === nodeId ? { ...n, data } : n)));
    setEdges((list) => {
      const kept = list.filter((e) => e.source !== nodeId || portOf(e.sourceHandle) < ports);
      return kept.length === list.length ? list : kept;
    });
    touch();
  }, []);

  // Keeps wires on the same rule when Switch rules are added or removed; `map` returns the new port, or -1 to drop.
  const remapPorts = useCallback((nodeId, map) => {
    setEdges((list) =>
      list.flatMap((e) => {
        if (e.source !== nodeId) return [e];
        const next = map(portOf(e.sourceHandle));
        return next < 0 ? [] : [wire(e.source, e.target, next)];
      })
    );
  }, []);

  const renameNode = useCallback((nodeId, wanted) => {
    setNodes((list) => {
      const node = list.find((n) => n.id === nodeId);
      const name = uniqueName(list, wanted, nodeId);
      if (!node || name === node.data.name) return list;
      return renameRefs(list, node.data.name, name).map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, name } } : n));
    });
    touch();
  }, []);

  // Adds a step after one output port of `anchorId`. With `onlyTarget`, it is spliced into that one wire.
  const addAfter = useCallback(
    (anchorId, typeName, onlyTarget, port = 0) => {
      const list = getNodes();
      const wires = getEdges();
      const anchor = list.find((n) => n.id === anchorId);
      const def = types[typeName];
      const outgoing = wires.filter(
        (e) => e.source === anchorId && portOf(e.sourceHandle) === port && (!onlyTarget || e.target === onlyTarget)
      );
      const node = {
        id: newId(),
        type: "step",
        position: { x: anchor.position.x + GAP_X, y: anchor.position.y + port * BRANCH_Y },
        selected: true,
        data: { type: typeName, name: uniqueName(list, def.label), params: defaultParams(types, typeName) },
      };

      let nextNodes = list.map((n) => (n.selected ? { ...n, selected: false } : n));
      let nextEdges = wires;
      if (outgoing.length && def.outputs) {
        const shifted = descendants(wires, outgoing.map((e) => e.target));
        nextNodes = nextNodes.map((n) => (shifted.has(n.id) ? { ...n, position: { x: n.position.x + GAP_X, y: n.position.y } } : n));
        nextEdges = [...wires.filter((e) => !outgoing.includes(e)), ...outgoing.map((e) => wire(node.id, e.target))];
      } else if (outgoing.length) {
        node.position.y += BRANCH_Y * outgoing.length;
      }
      setNodes([...nextNodes, node]);
      setEdges([...nextEdges, wire(anchorId, node.id, port)]);
      touch();
    },
    [types]
  );

  const addLoose = (typeName) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const list = getNodes();
    const def = types[typeName];
    setNodes([
      ...list.map((n) => (n.selected ? { ...n, selected: false } : n)),
      {
        id: newId(),
        type: "step",
        position: { x: Math.round(center.x - 120), y: Math.round(center.y - 32) },
        selected: true,
        data: { type: typeName, name: uniqueName(list, def.label), params: defaultParams(types, typeName) },
      },
    ]);
    touch();
  };

  // Removing a middle step reconnects its parent to its children so the chain stays intact.
  const removeNodes = useCallback((ids) => {
    const removable = getNodes().filter((n) => ids.includes(n.id) && n.data.type !== "input");
    if (!removable.length) return;
    let wires = getEdges();
    for (const node of removable) {
      const incoming = wires.find((e) => e.target === node.id);
      const children = wires.filter((e) => e.source === node.id).map((e) => e.target);
      wires = wires.filter((e) => e.source !== node.id && e.target !== node.id);
      if (incoming) for (const child of children) wires.push(wire(incoming.source, child, portOf(incoming.sourceHandle)));
    }
    const gone = new Set(removable.map((n) => n.id));
    setNodes((list) => list.filter((n) => !gone.has(n.id)));
    setEdges(wires);
    setPanelId((open) => (gone.has(open) ? null : open));
    touch();
  }, []);

  const removeNode = useCallback((nodeId) => removeNodes([nodeId]), [removeNodes]);

  // Pasted steps land under the pointer when it is over the canvas, else offset from the originals.
  const pasteSteps = useCallback(
    (payload, stepY = PASTE_OFFSET) => {
      const list = getNodes();
      const minX = Math.min(...payload.nodes.map((n) => n.position.x));
      const minY = Math.min(...payload.nodes.map((n) => n.position.y));
      const shift = PASTE_OFFSET * pasteCountRef.current;
      const origin = pointerRef.current
        ? { x: pointerRef.current.x + shift, y: pointerRef.current.y + shift }
        : { x: minX, y: minY + stepY * (pasteCountRef.current + 1) };
      pasteCountRef.current += 1;

      const idMap = new Map();
      const renames = [];
      let pasted = [];
      for (const source of payload.nodes) {
        if (!types[source.data.type] || source.data.type === "input") continue;
        const id = newId();
        const name = uniqueName([...list, ...pasted], source.data.name);
        idMap.set(source.id, id);
        if (name !== source.data.name) renames.push([source.data.name, name]);
        pasted.push({
          id,
          type: "step",
          selected: true,
          position: { x: Math.round(origin.x + source.position.x - minX), y: Math.round(origin.y + source.position.y - minY) },
          data: { ...structuredClone(source.data), name },
        });
      }
      if (!pasted.length) return 0;
      for (const [from, to] of renames) pasted = renameRefs(pasted, from, to);

      const wires = (payload.connections || []).filter((c) => idMap.has(c.from) && idMap.has(c.to)).map((c) => wire(idMap.get(c.from), idMap.get(c.to), c.output));
      setNodes([...list.map((n) => (n.selected ? { ...n, selected: false } : n)), ...pasted]);
      setEdges((current) => [...current.map((e) => (e.selected ? { ...e, selected: false } : e)), ...wires]);
      touch();
      return pasted.length;
    },
    [types]
  );

  const copySelection = useCallback(() => {
    const payload = clipboardPayload(getNodes(), getEdges());
    if (!payload) return null;
    clipboardRef.current = payload;
    pasteCountRef.current = 0;
    navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => {});
    return payload;
  }, []);

  const duplicateSelection = useCallback(() => {
    const payload = clipboardPayload(getNodes(), getEdges());
    if (!payload) return;
    const saved = pointerRef.current;
    pointerRef.current = null;
    pasteCountRef.current = 0;
    pasteSteps(payload, DUPLICATE_OFFSET_Y);
    pointerRef.current = saved;
  }, [pasteSteps]);

  const selectAll = () => {
    setNodes((list) => list.map((n) => ({ ...n, selected: true })));
    setEdges((list) => list.map((e) => ({ ...e, selected: true })));
  };

  const clearSelection = () => {
    setNodes((list) => list.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((list) => list.map((e) => (e.selected ? { ...e, selected: false } : e)));
  };

  const deleteSelection = useCallback(() => {
    const selectedEdges = new Set(getEdges().filter((edge) => edge.selected).map((edge) => edge.id));
    if (selectedEdges.size) {
      setEdges((list) => list.filter((edge) => !selectedEdges.has(edge.id)));
      touch();
    }
    const selectedNodes = getNodes().filter((n) => n.selected).map((n) => n.id);
    if (selectedNodes.length) removeNodes(selectedNodes);
  }, [removeNodes]);

  const removeEdge = useCallback((edgeId) => {
    setEdges((list) => list.filter((e) => e.id !== edgeId));
    setHoveredEdge(null);
    touch();
  }, []);

  const isValidConnection = useCallback(
    ({ source, target }) => {
      if (source === target) return false;
      const targetNode = getNodes().find((n) => n.id === target);
      if (!targetNode || types[targetNode.data.type]?.inputs === false) return false;
      return !isAncestor(getEdges(), target, source);
    },
    [types]
  );

  const onConnect = useCallback(({ source, target, sourceHandle }) => {
    setEdges((list) => [...list.filter((e) => e.target !== target), wire(source, target, portOf(sourceHandle))]);
    touch();
  }, []);

  // Dropping a wire anywhere on a step connects to it, not only on its small input dot.
  const onConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || state.fromHandle?.type !== "source") return;
      const point = event.changedTouches?.[0] ?? event;
      const target = document.elementFromPoint(point.clientX, point.clientY)?.closest(".react-flow__node")?.dataset.id;
      const connection = { source: state.fromNode.id, sourceHandle: state.fromHandle.id, target };
      if (target && isValidConnection(connection)) onConnect(connection);
    },
    [isValidConnection, onConnect]
  );

  const readTestInput = () => {
    const trigger = getNodes().find((n) => n.data.type === "input");
    try {
      const input = JSON.parse(trigger?.data.params.testInput || "{}");
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("must be a JSON object");
      return { ...input, ...testFiles };
    } catch (err) {
      toast(`Test input on the Input step is not valid JSON: ${err.message}`, "error");
      return null;
    }
  };

  const execute = async (path, body) => {
    setRunning(true);
    try {
      setExec(await api(path, { method: "POST", body: { workflow: snapshot(), ...body } }));
      setHistoryKey((k) => k + 1);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setRunning(false);
    }
  };

  const run = useCallback(async () => {
    if (running) return;
    const input = readTestInput();
    if (input) await execute("/api/execute", { input });
  }, [running, meta, testFiles]);

  // Runs one step on what its parent produced in the current run; the rest of the run is kept.
  const runStep = useCallback(
    async (nodeId) => {
      if (running) return;
      const input = readTestInput();
      if (!input) return;
      setRunningStep(nodeId);
      await execute("/api/execute-step", { nodeId, executionId: exec?.id ?? null, input });
      setRunningStep(null);
    },
    [running, meta, exec, testFiles]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await api(`/api/workflows/${id}`, { method: "PUT", body: snapshot() });
      setMetaState((current) => ({ ...current, slug: saved.slug, updatedAt: saved.updatedAt }));
      setDirty(false);
      toast("Saved");
      return true;
    } catch (err) {
      toast(err.message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, meta]);

  const { allowLeave } = useUnsavedChanges(dirty, save);

  const duplicate = async () => {
    const { id: _, slug, createdAt, updatedAt, ...rest } = snapshot();
    try {
      const created = await api("/api/workflows", { method: "POST", body: { ...rest, name: `${meta.name} copy`, active: false } });
      toast(`Duplicated as ${created.name}`);
      setDirty(false);
      allowLeave();
      navigate(workflowPath(created.id));
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const deleteWorkflow = async () => {
    const ok = await confirm({
      title: `Delete ${meta.name}`,
      description: `/hook/${meta.slug} stops answering and the workflow file is removed. This can't be undone.`,
      confirmLabel: "Delete workflow",
      danger: true,
    });
    if (!ok) return;
    await api(`/api/workflows/${id}`, { method: "DELETE" });
    setDirty(false);
    allowLeave();
    toast(`Deleted ${meta.name}`);
    navigate("/workflows");
  };

  const pickExecution = async (executionId) => {
    try {
      setExec(await api(`/api/executions/${executionId}`));
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        save();
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        run();
      } else if (panelId || isTyping(e.target)) {
        return;
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelection();
      } else if (mod && e.key === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && e.key === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Escape") {
        clearSelection();
      } else if (e.key === "Enter") {
        const selected = getNodes().filter((n) => n.selected);
        if (selected.length === 1) setPanelId(selected[0].id);
      }
    };

    // Native clipboard events let ⌘C/⌘X/⌘V work without a clipboard permission prompt.
    const canUseClipboard = (e) => !panelId && !isTyping(e.target) && !window.getSelection()?.toString();
    const onCopy = (e) => {
      if (!canUseClipboard(e)) return;
      const payload = copySelection();
      if (!payload) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", JSON.stringify(payload));
      return payload;
    };
    const onCut = (e) => {
      const payload = onCopy(e);
      if (payload) removeNodes(payload.nodes.map((n) => n.id));
    };
    const onPaste = (e) => {
      if (!canUseClipboard(e)) return;
      // Other text on the clipboard is not a cue to re-paste the last copied steps.
      const text = e.clipboardData.getData("text/plain");
      const payload = text ? readPayload(text) : clipboardRef.current;
      if (!payload) return;
      e.preventDefault();
      const count = pasteSteps(payload);
      if (count) toast(`Pasted ${plural(count)}`);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
    };
  }, [save, run, panelId, removeNodes, deleteSelection, duplicateSelection, copySelection, pasteSteps]);

  const selectedCount = nodes.filter((n) => n.selected).length;

  const context = useMemo(
    () => ({
      types,
      testFiles,
      setTestFiles,
      usage: usageOf(meta),
      exec,
      running,
      runningStep,
      nodes,
      edges,
      hoveredEdge,
      setHoveredEdge,
      addAfter,
      removeNode,
      removeEdge,
      openPanel: setPanelId,
      run,
      runStep,
      setParam,
      remapPorts,
      renameNode,
    }),
    [types, testFiles, meta?.usage, exec, running, runningStep, nodes, edges, hoveredEdge, addAfter, removeNode, removeEdge, run, runStep, setParam, remapPorts, renameNode]
  );

  if (!types || !meta) {
    return (
      <div className="page">
        <header className="topbar" />
        <div className="editor-loading" />
      </div>
    );
  }

  return (
    <EditorContext.Provider value={context}>
      <div className="page editor">
        <header className="topbar">
          <Tip label="All workflows">
            <Link to="/workflows" className="back" aria-label="All workflows">
              <ArrowLeft size={16} strokeWidth={1.75} />
            </Link>
          </Tip>
          <nav className="crumbs">
            <Link to="/workflows" className="crumb">
              Workflows
            </Link>
            <span className="crumb-sep">/</span>
            <input
              ref={nameRef}
              className="title-input"
              value={meta.name}
              spellCheck={false}
              aria-label="Workflow name"
              size={Math.max(8, meta.name.length)}
              onChange={(e) => setMeta({ name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </nav>
          <span className="slug mono">/hook/{meta.slug}</span>
          {meta.lockedBy && (
            <Tip label={`Used by ${meta.lockedBy}, so it can't be deleted`}>
              <span className="lock-chip">
                <Lock size={12} strokeWidth={2} />
                {meta.lockedBy}
              </span>
            </Tip>
          )}
          <div className="spacer" />
          {dirty && <span className="unsaved">Unsaved changes</span>}
          <UsagePicker usage={usageOf(meta)} onChange={(usage) => setMeta({ usage })} blockers={deliveryBlockers(nodes, types)} />
          <Tip label={meta.active ? "Answering /hook and /resolve" : "Not answering requests"}>
            <span>
              <Switch checked={Boolean(meta.active)} onChange={(active) => setMeta({ active })} label="Active" />
            </span>
          </Tip>
          <span className="topbar-divider" />
          <Button variant="ghost" icon={History} className={historyOpen ? "is-on" : undefined} onClick={() => setHistoryOpen(!historyOpen)}>
            History
          </Button>
          <Menu
            trigger={<Button variant="ghost" icon={Ellipsis} aria-label="More actions" />}
            items={[
              { label: "Duplicate", icon: Copy, onSelect: duplicate },
              "separator",
              !meta.lockedBy && { label: "Delete workflow", icon: Trash2, danger: true, onSelect: deleteWorkflow },
              !meta.lockedBy && "separator",
              { label: "Sign out", icon: LogOut, onSelect: signOut },
            ]}
          />
          <Tip label="Save" keys={["⌘", "S"]}>
            <Button icon={Save} loading={saving} onClick={save} disabled={!dirty && !saving}>
              Save
            </Button>
          </Tip>
          <Tip label="Run with the test input" keys={["⌘", "↵"]}>
            <Button variant="primary" icon={Play} loading={running} onClick={run}>
              Run
            </Button>
          </Tip>
        </header>

        <div className="editor-body">
          <div
            className={`canvas${spaceHeld ? " is-panning" : ""}`}
            ref={canvasRef}
            onPointerMove={(e) => {
              pointerRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              pasteCountRef.current = 0;
            }}
            onPointerLeave={() => (pointerRef.current = null)}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              connectOnClick={false}
              connectionDragThreshold={4}
              connectionRadius={36}
              onNodeDragStop={touch}
              onNodeDoubleClick={(_, node) => setPanelId(node.id)}
              onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
              onEdgeMouseLeave={() => setHoveredEdge(null)}
              deleteKeyCode={null}
              panOnDrag={PAN_BUTTONS}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              selectionKeyCode={null}
              multiSelectionKeyCode={["Meta", "Control", "Shift"]}
              panActivationKeyCode="Space"
              panOnScroll
              zoomOnScroll={false}
              snapToGrid
              snapGrid={[20, 20]}
              minZoom={0.25}
              maxZoom={2}
              colorMode="dark"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(237 237 237 / 0.1)" />
              <Panel position="bottom-left" className="canvas-tools">
                <Tip label="Zoom out" side="top">
                  <button type="button" aria-label="Zoom out" onClick={() => zoomOut({ duration: 200 })}>
                    <Minus size={16} strokeWidth={1.75} />
                  </button>
                </Tip>
                <Tip label="Zoom in" side="top">
                  <button type="button" aria-label="Zoom in" onClick={() => zoomIn({ duration: 200 })}>
                    <Plus size={16} strokeWidth={1.75} />
                  </button>
                </Tip>
                <Tip label="Fit to view" side="top">
                  <button type="button" aria-label="Fit to view" onClick={() => fitView({ ...FIT, duration: 300 })}>
                    <Maximize size={16} strokeWidth={1.75} />
                  </button>
                </Tip>
              </Panel>
              <Panel position="bottom-center">
                {selectedCount > 1 ? (
                  <SelectionBar
                    count={selectedCount}
                    onCopy={() => {
                      const payload = copySelection();
                      if (payload) toast(`Copied ${plural(payload.nodes.length)}`);
                    }}
                    onDuplicate={duplicateSelection}
                    onDelete={deleteSelection}
                    onClear={clearSelection}
                  />
                ) : (
                  <AddNodeMenu onPick={addLoose} side="top" align="center">
                    <Button icon={Plus} className="add-step">
                      Add step
                    </Button>
                  </AddNodeMenu>
                )}
              </Panel>
              {exec && !running && (
                <Panel position="top-center">
                  <RunCard exec={exec} stepName={nodes.find((n) => n.id === exec.step)?.data.name} onOpen={setPanelId} onClear={() => setExec(null)} />
                </Panel>
              )}
            </ReactFlow>
          </div>
          {historyOpen && (
            <HistoryDrawer workflowId={id} currentId={exec?.id} refreshKey={historyKey} onPick={pickExecution} onClose={() => setHistoryOpen(false)} />
          )}
        </div>

        <NodePanel nodeId={panelId} onClose={() => setPanelId(null)} meta={meta} setMeta={setMeta} />
      </div>
    </EditorContext.Provider>
  );
}

export default function Editor() {
  const { id } = useParams();
  return (
    <ReactFlowProvider key={id}>
      <WorkflowEditor id={id} />
    </ReactFlowProvider>
  );
}
