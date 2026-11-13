import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Copy, Ellipsis, Lock, PencilLine, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { USAGES, createWorkflow, iconFor, relativeTime, usageOf, workflowPath } from "../lib/workflow.js";
import { Button, Switch, Tip } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";

const MAX_STEPS = 7;
const TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Paused" },
  { value: "delivery", label: "Delivery" },
  { value: "pipeline", label: "Pipeline" },
];

const inTab = (workflow, tab) => {
  if (tab === "active") return workflow.active;
  if (tab === "inactive") return !workflow.active;
  if (tab === "delivery" || tab === "pipeline") return usageOf(workflow).includes(tab);
  return true;
};

function UsageChips({ usage }) {
  return (
    <span className="usage-chips">
      {USAGES.filter((option) => usage.includes(option.value)).map((option) => (
        <span key={option.value} className={`usage-chip is-${option.value}`}>
          {option.label}
        </span>
      ))}
    </span>
  );
}

function Route({ steps }) {
  const shown = steps.slice(0, MAX_STEPS);
  return (
    <div className="route">
      {shown.map((step, index) => {
        const Icon = iconFor(step.type);
        return (
          <Fragment key={index}>
            {index > 0 && <span className="route-wire" />}
            <Tip label={step.name} side="top">
              <span className="route-stop">
                <Icon size={14} strokeWidth={1.5} />
              </span>
            </Tip>
          </Fragment>
        );
      })}
      {steps.length > MAX_STEPS && <span className="route-more">+{steps.length - MAX_STEPS}</span>}
    </div>
  );
}

function LastRun({ run }) {
  if (!run) return <span className="muted col-run">Not run yet</span>;
  return (
    <span className="last-run col-run">
      <span className={`dot dot-${run.status}`} />
      <span>{relativeTime(run.startedAt)}</span>
      <span className="muted mono">{run.durationMs} ms</span>
    </span>
  );
}

export default function Workflows() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const [workflows, setWorkflows] = useState(null);
  const [filter, setFilter] = useState("all");
  const [creating, setCreating] = useState(false);

  const refresh = () =>
    api("/api/workflows")
      .then(setWorkflows)
      .catch((err) => toast(err.message, "error"));

  useEffect(() => {
    refresh();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (workflows || []).filter((w) => {
      if (!inTab(w, filter)) return false;
      return !q || w.name.toLowerCase().includes(q) || w.slug.includes(q) || w.match?.value.toLowerCase().includes(q);
    });
  }, [workflows, query, filter]);

  const create = async () => {
    setCreating(true);
    try {
      const created = await createWorkflow();
      navigate(workflowPath(created.id), { state: { rename: true } });
    } catch (err) {
      toast(err.message, "error");
      setCreating(false);
    }
  };

  const setActive = async (row, active) => {
    setWorkflows((list) => list.map((w) => (w.id === row.id ? { ...w, active } : w)));
    try {
      const full = await api(`/api/workflows/${row.id}`);
      const saved = await api(`/api/workflows/${row.id}`, { method: "PUT", body: { ...full, active } });
      setWorkflows((list) => list.map((w) => (w.id === row.id ? { ...w, updatedAt: saved.updatedAt } : w)));
      toast(active ? `${row.name} is answering requests` : `${row.name} is paused`);
    } catch (err) {
      toast(err.message, "error");
      refresh();
    }
  };

  const duplicate = async (row) => {
    try {
      const full = await api(`/api/workflows/${row.id}`);
      const { id, slug, createdAt, updatedAt, ...rest } = full;
      await api("/api/workflows", { method: "POST", body: { ...rest, name: `${full.name} copy`, active: false } });
      toast(`Duplicated ${row.name}`);
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async (row) => {
    const ok = await confirm({
      title: `Delete ${row.name}`,
      description: `/hook/${row.slug} stops answering and the workflow file is removed. This can't be undone.`,
      confirmLabel: "Delete workflow",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/workflows/${row.id}`, { method: "DELETE" });
      setWorkflows((list) => list.filter((w) => w.id !== row.id));
      toast(`Deleted ${row.name}`);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const activeCount = workflows?.filter((w) => w.active).length ?? 0;
  const counts = Object.fromEntries(TABS.map((tab) => [tab.value, (workflows || []).filter((w) => inTab(w, tab.value)).length]));
  const open = (row) => navigate(workflowPath(row.id));

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Workflows</h1>
          {workflows && (
            <p className="home-sub">
              <span className="mono">{activeCount}</span> of <span className="mono">{workflows.length}</span> answering on /hook and /resolve
            </p>
          )}
        </div>
        <Button variant="primary" icon={Plus} onClick={create} loading={creating}>
          New workflow
        </Button>
      </div>

      <div className="content-tabs" role="tablist" aria-label="Filter workflows">
        {TABS.map((tab) => (
          <button key={tab.value} type="button" role="tab" aria-selected={filter === tab.value} className="content-tab" onClick={() => setFilter(tab.value)}>
            {tab.label}
            {workflows && <span className="content-tab-count mono">{counts[tab.value]}</span>}
          </button>
        ))}
      </div>

        {workflows === null ? (
          <div className="wf-list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="wf-row wf-skeleton" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="empty-state">
            <div className="route route-ghost">
              <span className="route-stop" />
              <span className="route-wire" />
              <span className="route-stop" />
              <span className="route-wire" />
              <span className="route-stop" />
            </div>
            <h2>No workflows yet</h2>
            <p>A workflow takes a URL, calls whatever it needs to, and answers with the resolved link</p>
            <Button variant="primary" icon={Plus} onClick={create} loading={creating}>
              New workflow
            </Button>
          </div>
        ) : (
          <div className="wf-list">
            <div className="wf-row wf-head">
              <span />
              <span>Name</span>
              <span className="col-steps">Steps</span>
              <span className="col-match">Matches</span>
              <span className="col-run">Last run</span>
              <span className="col-updated">Updated</span>
              <span />
            </div>
            {visible.map((row) => (
              <div key={row.id} className="wf-row" role="link" tabIndex={0} onClick={() => open(row)} onKeyDown={(e) => e.key === "Enter" && open(row)}>
                <span onClick={(e) => e.stopPropagation()}>
                  <Tip label={row.active ? "Answering requests" : "Paused"} side="top">
                    <span>
                      <Switch checked={row.active} onChange={(value) => setActive(row, value)} aria-label="Active" />
                    </span>
                  </Tip>
                </span>
                <span className="wf-name">
                  <span className="wf-title">
                    {row.name}
                    {row.lockedBy && (
                      <Tip label={`Used by ${row.lockedBy}, so it can't be deleted`} side="top">
                        <Lock size={13} strokeWidth={2} className="wf-lock" aria-label="Locked" />
                      </Tip>
                    )}
                  </span>
                  <span className="wf-meta">
                    <UsageChips usage={usageOf(row)} />
                    <span className="wf-slug mono">/hook/{row.slug}</span>
                  </span>
                </span>
                <span className="col-steps">
                  <Route steps={row.steps} />
                </span>
                {row.match ? (
                  <span className="wf-match mono col-match" title={row.match.value}>
                    <span className="muted">{row.match.type}</span> {row.match.value || "—"}
                  </span>
                ) : (
                  <span className="wf-match muted col-match">Webhook only</span>
                )}
                <LastRun run={row.lastRun} />
                <span className="muted col-updated">{relativeTime(row.updatedAt)}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  <Menu
                    trigger={<Button variant="ghost" size="sm" icon={Ellipsis} aria-label="Workflow actions" />}
                    items={[
                      { label: "Open", icon: PencilLine, onSelect: () => open(row) },
                      { label: "Duplicate", icon: Copy, onSelect: () => duplicate(row) },
                      !row.lockedBy && "separator",
                      !row.lockedBy && { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(row) },
                    ]}
                  />
                </span>
              </div>
            ))}
            {visible.length === 0 && <div className="wf-none">{query ? `Nothing matches “${query}”` : "No workflows in this tab"}</div>}
          </div>
        )}
    </div>
  );
}
