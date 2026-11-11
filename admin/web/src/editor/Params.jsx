import { useMemo } from "react";
import { Plus, X } from "lucide-react";
import { hasExpression, resolvePreview } from "../lib/expr.js";
import { paramValue } from "../lib/workflow.js";
import { Button, Checkbox, NumberInput, Select, Switch, TextInput } from "../ui/controls.jsx";
import { CodeField } from "../ui/CodeField.jsx";

const MONO_SELECTS = new Set(["method"]);
const ADD_LABELS = { query: "Add parameter", headers: "Add header", fields: "Add field" };

function stepFor(name) {
  if (/timeout/i.test(name)) return 1000;
  if (/cache/i.test(name)) return 60;
  return 1;
}

function Preview({ value, scope }) {
  const result = useMemo(() => {
    if (!hasExpression(value) || !scope) return null;
    try {
      const out = resolvePreview(value, scope);
      const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
      return { ok: true, text: text == null ? "undefined" : text.length > 600 ? `${text.slice(0, 600)}…` : text };
    } catch (err) {
      return { ok: false, text: err.message };
    }
  }, [value, scope]);
  if (!result) return null;
  return <div className={`preview${result.ok ? "" : " is-bad"}`}>{result.text || <span className="muted">Empty string</span>}</div>;
}

function ExprField({ value, onChange, scope, multiline, placeholder }) {
  return (
    <div className="expr-field">
      <CodeField value={value} onChange={onChange} variant={multiline ? "text" : "expression"} placeholder={placeholder} />
      <Preview value={value} scope={scope} />
    </div>
  );
}

function KvEditor({ def, rows, onChange, plain, scope }) {
  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const withRequired = Boolean(def.required);
  return (
    <div className="kv">
      {rows.length > 0 && (
        <div className={`kv-row kv-head${withRequired ? " has-req" : ""}`}>
          <span>{def.keyLabel || "Name"}</span>
          <span>{def.valueLabel || "Value"}</span>
          {withRequired && <span>Required</span>}
          <span />
        </div>
      )}
      {rows.map((row, index) => (
        <div key={index} className={`kv-row${withRequired ? " has-req" : ""}`}>
          <TextInput mono placeholder="name" value={row.key ?? ""} onChange={(e) => update(index, { key: e.target.value })} />
          {plain ? (
            <TextInput mono placeholder="No default" value={row.value ?? ""} onChange={(e) => update(index, { value: e.target.value })} />
          ) : (
            <ExprField value={row.value ?? ""} scope={scope} onChange={(value) => update(index, { value })} />
          )}
          {withRequired && (
            <span className="kv-req">
              <Checkbox checked={Boolean(row.required)} onChange={(required) => update(index, { required })} aria-label="Required" />
            </span>
          )}
          <Button variant="ghost" size="sm" icon={X} aria-label="Remove row" onClick={() => onChange(rows.filter((_, i) => i !== index))} />
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={Plus} className="kv-add" onClick={() => onChange([...rows, { key: "", value: "" }])}>
        {ADD_LABELS[def.name] || "Add row"}
      </Button>
    </div>
  );
}

const FIELD_KINDS = [
  { value: "text", label: "Text" },
  { value: "file", label: "File" },
];

function MultipartEditor({ rows, onChange, scope }) {
  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="kv">
      {rows.length > 0 && (
        <div className="kv-row mp-row kv-head">
          <span>Name</span>
          <span>Type</span>
          <span>Value</span>
          <span />
        </div>
      )}
      {rows.map((row, index) => {
        const isFile = row.kind === "file";
        return (
          <div key={index} className="kv-row mp-row">
            <TextInput mono placeholder={isFile ? "image" : "name"} value={row.key ?? ""} onChange={(e) => update(index, { key: e.target.value })} />
            <Select value={row.kind || "text"} onChange={(kind) => update(index, { kind })} options={FIELD_KINDS} aria-label="Field type" />
            <div className="mp-value">
              <ExprField
                value={row.value ?? ""}
                scope={scope}
                placeholder={isFile ? "Image URL, data: URL, base64, or {{ $json.file }}" : "Value"}
                onChange={(value) => update(index, { value })}
              />
              {isFile && <ExprField value={row.fileName ?? ""} scope={scope} placeholder="File name (optional, e.g. photo.jpg)" onChange={(fileName) => update(index, { fileName })} />}
            </div>
            <Button variant="ghost" size="sm" icon={X} aria-label="Remove field" onClick={() => onChange(rows.filter((_, i) => i !== index))} />
          </div>
        );
      })}
      <div className="mp-add">
        <Button variant="ghost" size="sm" icon={Plus} className="kv-add" onClick={() => onChange([...rows, { key: "", kind: "text", value: "" }])}>
          Add text field
        </Button>
        <Button variant="ghost" size="sm" icon={Plus} className="kv-add" onClick={() => onChange([...rows, { key: "", kind: "file", value: "", fileName: "" }])}>
          Add file
        </Button>
      </div>
    </div>
  );
}

function ConditionsEditor({ def, rows, onChange, scope, joiner, onRemapPorts }) {
  const remove = (index) => {
    if (def.labelled) onRemapPorts?.((port) => (port === index ? -1 : port > index ? port - 1 : port));
    onChange(rows.filter((_, i) => i !== index));
  };
  const add = () => {
    if (def.labelled) onRemapPorts?.((port) => (port >= rows.length ? port + 1 : port));
    onChange([...rows, def.labelled ? { label: "", left: "", op: "equals", right: "" } : { left: "", op: "equals", right: "" }]);
  };
  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const unary = new Set(def.operators.filter((op) => op.unary).map((op) => op.value));
  const noun = def.unit || "condition";
  return (
    <div className="conditions">
      {rows.map((row, index) => (
        <div key={index} className="condition">
          <div className="condition-head">
            {def.labelled ? (
              <TextInput
                className="condition-label"
                placeholder={`Rule ${index + 1}`}
                value={row.label ?? ""}
                onChange={(e) => update(index, { label: e.target.value })}
                aria-label="Output name"
              />
            ) : (
              <span className="condition-title">
                {index === 0 ? "Where" : joiner}
              </span>
            )}
            <span className="spacer" />
            <Button variant="ghost" size="sm" icon={X} aria-label={`Remove ${noun}`} onClick={() => remove(index)} />
          </div>
          <ExprField value={row.left ?? ""} scope={scope} placeholder="{{ $json.field }}" onChange={(left) => update(index, { left })} />
          <div className={`condition-compare${unary.has(row.op) ? " is-unary" : ""}`}>
            <Select value={row.op || "equals"} onChange={(op) => update(index, { op })} options={def.operators} />
            {!unary.has(row.op) && <ExprField value={row.right ?? ""} scope={scope} placeholder="Value" onChange={(right) => update(index, { right })} />}
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        icon={Plus}
        className="kv-add"
        onClick={add}
      >
        Add {noun}
      </Button>
    </div>
  );
}

function JsonField({ value, onChange }) {
  let error = null;
  try {
    JSON.parse(value || "{}");
  } catch (err) {
    error = err.message;
  }
  return (
    <>
      <CodeField variant="json" value={value} onChange={onChange} minHeight="120px" />
      {error && <div className="preview is-bad">{error}</div>}
    </>
  );
}

function isVisible(type, params, def) {
  if (!def.show) return true;
  return Object.entries(def.show).every(([key, allowed]) => {
    const other = type.params.find((p) => p.name === key);
    return allowed.includes(other ? paramValue(params, other) : undefined);
  });
}

export function Params({ node, type, onParam, scope, onRemapPorts }) {
  const params = node.data.params;
  const plain = node.data.type === "input";

  return type.params
    .filter((def) => isVisible(type, params, def))
    .map((def) => {
      const value = paramValue(params, def);
      const set = (next) => onParam(def.name, next);

      if (def.type === "boolean") {
        return (
          <div key={def.name} className="field field-inline">
            <Switch checked={Boolean(value)} onChange={set} label={def.label} />
          </div>
        );
      }

      let control;
      if (def.type === "select") {
        control = <Select value={value} onChange={set} options={def.options} mono={MONO_SELECTS.has(def.name)} />;
      } else if (def.type === "number") {
        control = <NumberInput value={value} onChange={set} step={stepFor(def.name)} />;
      } else if (def.type === "conditions") {
        const combine = type.params.find((p) => p.name === "combine");
        const joiner = combine && paramValue(params, combine) === "any" ? "Or" : "And";
        control = <ConditionsEditor def={def} rows={value || []} onChange={set} scope={scope} joiner={joiner} onRemapPorts={onRemapPorts} />;
      } else if (def.type === "kv") {
        control = <KvEditor def={def} rows={value || []} onChange={set} plain={plain} scope={scope} />;
      } else if (def.type === "multipart") {
        control = <MultipartEditor rows={value || []} onChange={set} scope={scope} />;
      } else if (def.type === "code") {
        control = <CodeField variant="javascript" value={value} onChange={set} minHeight="300px" />;
      } else if (def.type === "json") {
        control = <JsonField value={value} onChange={set} />;
      } else if (plain) {
        control = <TextInput mono value={value ?? ""} placeholder={def.placeholder} onChange={(e) => set(e.target.value)} />;
      } else {
        control = <ExprField value={value ?? ""} onChange={set} scope={scope} multiline={def.type === "text"} placeholder={def.placeholder} />;
      }

      return (
        <div key={def.name} className="field">
          <span className="field-label">{def.label}</span>
          {control}
        </div>
      );
    });
}
