import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Dialog } from "radix-ui";
import { ArrowDownToLine, Copy, Ellipsis, Eye, EyeOff, KeyRound, Lock, PencilLine, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { forgetVariables } from "../lib/variables.js";
import { relativeTime, workflowPath } from "../lib/workflow.js";
import { Button, TextInput, Tip } from "../ui/controls.jsx";
import { Field } from "../ui/form.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";

const NAME_RULE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const reference = (name) => `{{ $env.${name} }}`;

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

function KeySetup() {
  const { toast } = useFeedback();
  const [key] = useState(randomKey);
  const line = `SECRETS_KEY=${key}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line);
      toast("Copied");
    } catch {
      toast("Couldn't copy", "error");
    }
  };
  return (
    <div className="var-setup">
      <ShieldAlert size={20} strokeWidth={1.5} />
      <div>
        <strong>Add an encryption key to start</strong>
        <p>
          Values are encrypted with <code>SECRETS_KEY</code>, which stays in the server's environment so the database alone can't reveal them. Add this line to{" "}
          <code>.env</code> (and to production's environment, with its own key), then restart the server. This is the only setting that stays in .env.
        </p>
        <div className="var-setup-line">
          <code className="mono">{line}</code>
          <Button size="sm" icon={Copy} onClick={copy}>
            Copy
          </Button>
        </div>
        <p className="form-hint">Keep it safe: if it's lost or changed, saved values can't be read and must be entered again.</p>
      </div>
    </div>
  );
}

function VariableDialog({ editing, taken, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = editing === true;
  const [name, setName] = useState(isNew ? "" : editing.name);
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const problems = {};
    if (!NAME_RULE.test(name)) problems.name = "Letters, digits and _ only, starting with a letter or _.";
    else if (isNew && taken.has(name)) problems.name = "A variable with this name exists. Edit it instead.";
    if (!value) problems.value = "Enter the value.";
    setError(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      await api(`/api/variables/${encodeURIComponent(name)}`, { method: "PUT", body: { value } });
      toast(isNew ? `Added ${name}` : `Updated ${name}`);
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog var-dialog" aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{isNew ? "New variable" : `Change ${editing.name}`}</Dialog.Title>
          <form
            className="var-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving) save();
            }}
          >
            <Field label="Name" htmlFor="var-name" error={error.name} hint={!error.name && name ? `Use it in a workflow as ${reference(name)}` : "e.g. POSTIMAGE_KEY"}>
              <TextInput id="var-name" mono autoFocus={isNew} disabled={!isNew} autoComplete="off" data-1p-ignore data-lpignore="true" value={name} maxLength={64} onChange={(e) => setName(e.target.value.trim())} />
            </Field>
            <Field
              label={isNew ? "Value" : "New value"}
              htmlFor="var-value"
              error={error.value}
              hint={isNew ? "Encrypted before it's saved. It can't be read back here, only replaced." : "The current value can't be shown. Saving replaces it."}
              actions={
                <Button variant="ghost" size="sm" icon={shown ? EyeOff : Eye} onClick={() => setShown(!shown)}>
                  {shown ? "Hide" : "Show"}
                </Button>
              }
            >
              <TextInput id="var-value" mono autoFocus={!isNew} type={shown ? "text" : "password"} autoComplete="new-password" data-1p-ignore data-lpignore="true" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
            <div className="dialog-actions">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={Lock} loading={saving}>
                {isNew ? "Encrypt and save" : "Replace value"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UsedBy({ workflows }) {
  if (!workflows.length) return <span className="muted">Not used</span>;
  return (
    <span className="var-used">
      {workflows.map((w) => (
        <Link key={w.id} to={workflowPath(w.id)} className="var-used-chip">
          {w.name}
        </Link>
      ))}
    </span>
  );
}

export default function Variables() {
  const { confirm, toast } = useFeedback();
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim().toLowerCase();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);

  const refresh = () =>
    api("/api/variables")
      .then(setData)
      .catch((err) => toast(err.message, "error"));

  useEffect(() => {
    refresh();
  }, []);

  const changed = () => {
    forgetVariables();
    setEditing(null);
    refresh();
  };

  const items = useMemo(() => (data?.items || []).filter((item) => !query || item.name.toLowerCase().includes(query)), [data, query]);
  const fromEnv = useMemo(() => (data?.fromEnv || []).filter((item) => !query || item.name.toLowerCase().includes(query)), [data, query]);
  const taken = useMemo(() => new Set((data?.items || []).map((item) => item.name)), [data]);

  const copyReference = async (name) => {
    try {
      await navigator.clipboard.writeText(reference(name));
      toast(`Copied ${reference(name)}`);
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  const remove = async (item) => {
    const used = item.usedBy.length ? ` ${item.usedBy.map((w) => w.name).join(", ")} read${item.usedBy.length === 1 ? "s" : ""} it and will get nothing.` : "";
    const ok = await confirm({
      title: `Delete ${item.name}`,
      description: `The encrypted value is removed and can't be recovered.${used}${item.overridesEnv ? " Workflows fall back to the value in .env." : ""}`,
      confirmLabel: "Delete variable",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/variables/${encodeURIComponent(item.name)}`, { method: "DELETE" });
      toast(`Deleted ${item.name}`);
      changed();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const importFromEnv = async (name) => {
    try {
      await api(`/api/variables/${encodeURIComponent(name)}/import`, { method: "POST" });
      toast(`${name} is now saved in the app. You can remove it from .env.`);
      changed();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Variables</h1>
          <p className="home-sub">
            Keys and settings for workflows, read as <code className="mono">{"{{ $env.NAME }}"}</code>. Encrypted in the database; changes apply on the next run.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setEditing(true)} disabled={!data?.configured}>
          New variable
        </Button>
      </div>

      {data && !data.configured && <KeySetup />}

      {data === null ? (
        <div className="wf-list var-list">
          {[0, 1].map((i) => (
            <div key={i} className="wf-row wf-skeleton" />
          ))}
        </div>
      ) : data.items.length === 0 && data.configured ? (
        <div className="empty-state">
          <KeyRound size={28} strokeWidth={1.25} />
          <h2>No variables yet</h2>
          <p>Add API keys and tokens here instead of .env. Change them any time without restarting.</p>
          <Button variant="primary" icon={Plus} onClick={() => setEditing(true)}>
            New variable
          </Button>
        </div>
      ) : (
        data.items.length > 0 && (
          <div className="var-list">
            <div className="var-row var-head">
              <span>Name</span>
              <span className="var-col-value">Value</span>
              <span className="var-col-used">Used by</span>
              <span className="var-col-updated">Updated</span>
              <span />
            </div>
            {items.map((item) => (
              <div key={item.name} className="var-row">
                <span className="var-name">
                  <span className="mono">{item.name}</span>
                  {item.overridesEnv && (
                    <Tip label="Also set in .env. The value saved here is the one workflows use." side="top">
                      <span className="var-badge">overrides .env</span>
                    </Tip>
                  )}
                </span>
                <span className="var-col-value mono">
                  {item.readable ? item.hint : <span className="var-unreadable">Can't decrypt. Wrong SECRETS_KEY?</span>}
                </span>
                <span className="var-col-used">
                  <UsedBy workflows={item.usedBy} />
                </span>
                <span className="var-col-updated muted">{relativeTime(item.updatedAt)}</span>
                <Menu
                  trigger={<Button variant="ghost" size="sm" icon={Ellipsis} aria-label={`Actions for ${item.name}`} />}
                  items={[
                    { label: "Change value", icon: PencilLine, onSelect: () => setEditing(item) },
                    { label: "Copy reference", icon: Copy, hint: "{{ $env… }}", onSelect: () => copyReference(item.name) },
                    "separator",
                    { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(item) },
                  ]}
                />
              </div>
            ))}
            {items.length === 0 && <div className="wf-none">Nothing matches “{query}”</div>}
          </div>
        )
      )}

      {fromEnv.length > 0 && (
        <section className="var-env">
          <h2>Still in .env</h2>
          <p className="home-sub">These WF_ variables come from the server's environment. Move them into the app to change them without a restart, then delete the line from .env.</p>
          <div className="var-list">
            {fromEnv.map((item) => (
              <div key={item.name} className="var-row var-env-row">
                <span className="var-name mono">{item.name}</span>
                <span className="var-col-used">
                  <UsedBy workflows={item.usedBy} />
                </span>
                <Button size="sm" icon={ArrowDownToLine} onClick={() => importFromEnv(item.name)} disabled={!data.configured}>
                  Move into app
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && <VariableDialog editing={editing} taken={taken} onClose={() => setEditing(null)} onSaved={changed} />}
    </div>
  );
}
