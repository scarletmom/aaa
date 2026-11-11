import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PATH_MIME } from "../ui/CodeField.jsx";

const STRING_PREVIEW = 300;
const MAX_ENTRIES = 500;

function childPath(base, key, isIndex) {
  if (isIndex) return `${base}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

function Key({ name, path, isIndex }) {
  if (name == null) return null;
  return (
    <>
      <span
        className={isIndex ? "j-key j-index" : "j-key"}
        draggable
        title={`Drag into a field: {{ ${path} }} (or ${path} in JavaScript)`}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", `{{ ${path} }}`);
          e.dataTransfer.setData(PATH_MIME, path);
        }}
      >
        {name}
      </span>
      <span className="j-colon">: </span>
    </>
  );
}

function Scalar({ value }) {
  const [expanded, setExpanded] = useState(false);
  if (value === null) return <span className="j-null">null</span>;
  if (typeof value === "number") return <span className="j-num">{value}</span>;
  if (typeof value === "boolean") return <span className="j-bool">{String(value)}</span>;
  const text = String(value);
  if (expanded || text.length <= STRING_PREVIEW) return <span className="j-str">{JSON.stringify(text)}</span>;
  return (
    <span>
      <span className="j-str">{JSON.stringify(text.slice(0, STRING_PREVIEW)).slice(0, -1)}…</span>
      <button type="button" className="j-more" onClick={() => setExpanded(true)}>
        Show all {text.length.toLocaleString()} chars
      </button>
    </span>
  );
}

function Branch({ name, value, path, depth, isIndex }) {
  const [open, setOpen] = useState(depth < 2);
  if (value === null || typeof value !== "object") {
    return (
      <div className="j-row">
        <Key name={name} path={path} isIndex={isIndex} />
        <Scalar value={value} />
      </div>
    );
  }
  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
  return (
    <div className="j-branch">
      <div className="j-row j-toggle" onClick={() => setOpen(!open)}>
        <ChevronRight size={12} strokeWidth={2} className={`j-chevron${open ? " is-open" : ""}`} />
        <Key name={name} path={path} isIndex={isIndex} />
        <span className="j-punct">{isArray ? "[" : "{"}</span>
        <span className="j-count">
          {entries.length} {isArray ? (entries.length === 1 ? "item" : "items") : entries.length === 1 ? "key" : "keys"}
        </span>
        <span className="j-punct">{isArray ? "]" : "}"}</span>
      </div>
      {open && (
        <div className="j-children">
          {entries.slice(0, MAX_ENTRIES).map(([k, v]) => (
            <Branch key={k} name={String(k)} value={v} path={childPath(path, String(k), isArray)} depth={depth + 1} isIndex={isArray} />
          ))}
          {entries.length > MAX_ENTRIES && <div className="j-row j-count">{entries.length - MAX_ENTRIES} more</div>}
        </div>
      )}
    </div>
  );
}

export function DataView({ value, basePath, mode }) {
  if (mode === "json") return <pre className="j-raw">{JSON.stringify(value, null, 2)}</pre>;
  if (value === null || typeof value !== "object") {
    return (
      <div className="j-tree">
        <Branch name={null} value={value} path={basePath} depth={0} />
      </div>
    );
  }
  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
  return (
    <div className="j-tree">
      {entries.map(([k, v]) => (
        <Branch key={k} name={String(k)} value={v} path={childPath(basePath, String(k), isArray)} depth={1} isIndex={isArray} />
      ))}
    </div>
  );
}
