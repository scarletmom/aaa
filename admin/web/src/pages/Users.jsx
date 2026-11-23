import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Dialog } from "radix-ui";
import { ChevronRight, Crown, X } from "lucide-react";
import { api } from "../lib/api.js";
import { formatCount, formatDate } from "../lib/content.js";
import { Button, Segmented, TextInput } from "../ui/controls.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, isSetupError } from "../ui/site.jsx";

const PLANS = [
  { value: "member", label: "Member", perk: "Can't watch videos" },
  { value: "member-lite", label: "Member Lite", perk: "Watches videos, with ads" },
  { value: "member-pro", label: "Member Pro", perk: "Watches videos, no ads" },
];
const PLAN_LABELS = Object.fromEntries(PLANS.map((plan) => [plan.value, plan.label]));
const TABS = [{ value: "all", label: "All" }, ...PLANS];
const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_DAYS = [
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 365, label: "1 year" },
];

const timeFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function seenText(iso) {
  if (!iso) return "Never signed in";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Seen just now";
  if (seconds < 3600) return `Seen ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Seen ${Math.floor(seconds / 3600)}h ago`;
  return `Seen ${timeFormat.format(new Date(iso))}`;
}

function planNote(account) {
  if (account.role === "member-pro") return account.proUntil ? `Until ${formatDate(account.proUntil)}` : "Lifetime";
  if (account.proEnded) return `Pro ended ${formatDate(account.proEnded)}`;
  return "";
}

// <input type="date"> works in the browser's local day; Pro then lasts to the end of that day.
const dayInput = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const endOfDay = (day) => new Date(`${day}T23:59:59.999`).toISOString();

function Stat({ label, value, note }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function PlanBadge({ role }) {
  return (
    <span className={`plan-badge is-${role}`}>
      {role === "member-pro" && <Crown size={12} strokeWidth={2} />}
      {PLAN_LABELS[role]}
    </span>
  );
}

function PlanDialog({ account, onClose, onSaved }) {
  const { toast } = useFeedback();
  const [role, setRole] = useState(account.role);
  const [length, setLength] = useState(account.role === "member-pro" && account.proUntil ? "until" : "lifetime");
  const [until, setUntil] = useState(dayInput(account.proUntil || Date.now() + 30 * DAY_MS));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const timed = role === "member-pro" && length === "until";
  const proUntil = timed ? endOfDay(until) : null;
  const currentUntil = account.role === "member-pro" && account.proUntil ? dayInput(account.proUntil) : null;
  const unchanged = role === account.role && (timed ? until : null) === currentUntil;
  const losesPaidPro = account.role === "member-pro" && role !== "member-pro" && account.paidCheckouts > 0;

  const save = async (e) => {
    e.preventDefault();
    if (timed && (!until || new Date(proUntil).getTime() <= Date.now())) return setError("Pick a day after today.");
    setSaving(true);
    setError("");
    try {
      const saved = await api(`/api/users/${account.key}/plan`, { method: "PUT", body: { role, proUntil } });
      onSaved(saved);
      toast(`${saved.name} is now ${PLAN_LABELS[saved.role]}${saved.proUntil ? ` until ${formatDate(saved.proUntil)}` : ""}`);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const keepOpenWhileSaving = (e) => saving && e.preventDefault();

  return (
    <Dialog.Content className="dialog plan-dialog" onEscapeKeyDown={keepOpenWhileSaving} onInteractOutside={keepOpenWhileSaving} aria-describedby={undefined}>
      <form onSubmit={save}>
        <div className="category-dialog-head">
          <div>
            <Dialog.Title className="dialog-title">Change plan</Dialog.Title>
            <p className="dialog-text">{account.name}</p>
          </div>
          <Dialog.Close asChild>
            <Button variant="ghost" size="sm" icon={X} aria-label="Close" disabled={saving} />
          </Dialog.Close>
        </div>

        <div className="plan-options" role="radiogroup" aria-label="Plan">
          {PLANS.map((plan) => (
            <label key={plan.value} className={`plan-option${role === plan.value ? " is-selected" : ""}`}>
              <input type="radio" name="plan" value={plan.value} checked={role === plan.value} onChange={() => setRole(plan.value)} />
              <span>
                <span className="plan-option-title">
                  {plan.label}
                  {plan.value === account.role && <span className="plan-current">Current</span>}
                </span>
                <span className="plan-option-perk">{plan.perk}</span>
              </span>
            </label>
          ))}
        </div>

        {role === "member-pro" && (
          <div className="plan-length">
            <Segmented
              value={length}
              onChange={setLength}
              options={[
                { value: "lifetime", label: "Lifetime" },
                { value: "until", label: "Until a date" },
              ]}
            />
            {timed && (
              <div className="plan-until">
                <TextInput type="date" value={until} min={dayInput(Date.now() + DAY_MS)} onChange={(e) => setUntil(e.target.value)} aria-label="Pro until" />
                <div className="plan-quick">
                  {QUICK_DAYS.map((quick) => (
                    <Button key={quick.days} size="sm" variant="ghost" onClick={() => setUntil(dayInput(Date.now() + quick.days * DAY_MS))}>
                      {quick.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {losesPaidPro && <p className="plan-warning">This member paid for Pro. Changing the plan doesn't refund the payment.</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="form-hint plan-hint">They get the new plan the next time they open the news or videos site.</p>

        <div className="dialog-actions">
          <Dialog.Close asChild>
            <Button variant="ghost" disabled={saving}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button type="submit" variant="primary" loading={saving} disabled={unchanged}>
            Save plan
          </Button>
        </div>
      </form>
    </Dialog.Content>
  );
}

export default function Users() {
  const { toast } = useFeedback();
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim();
  const [tab, setTab] = useState("all");
  const [data, setData] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState(null);
  const request = useRef(0);

  const url = (offset) => `/api/users?${new URLSearchParams({ role: tab, q: query, ...(offset ? { offset } : {}) })}`;

  const load = () => {
    const id = ++request.current;
    return api(url())
      .then((result) => id === request.current && setData(result))
      .catch((err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error")));
  };

  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [tab, query]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await api(url(data.next));
      setData((current) => ({ ...current, accounts: [...current.accounts, ...more.accounts], next: more.next }));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoadingMore(false);
    }
  };

  // Counts and tab membership change with the plan, so the first page is read again.
  const onSaved = (saved) => {
    setData((current) => ({ ...current, accounts: current.accounts.map((a) => (a.key === saved.key ? saved : a)) }));
    load();
  };

  if (setupNeeded) {
    return (
      <div className="home">
        <div className="home-head">
          <h1>Users</h1>
        </div>
        <SetupNotice />
      </div>
    );
  }

  const counts = data?.counts;

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Users</h1>
          <p className="home-sub">Members of the news and videos sites. Open one to change their plan.</p>
        </div>
      </div>

      {counts && (
        <div className="stat-row">
          <Stat label="Members" value={formatCount(counts.total)} note={`${formatCount(counts.week)} joined in the last 7 days`} />
          <Stat label="Member Lite" value={formatCount(counts["member-lite"])} note="videos with ads" />
          <Stat label="Member Pro" value={formatCount(counts["member-pro"])} note="videos, no ads" />
        </div>
      )}

      <div className="content-tabs" role="tablist" aria-label="Filter by plan">
        {TABS.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} className="content-tab" onClick={() => setTab(item.value)}>
            {item.label}
            {counts && <span className="content-tab-count mono">{formatCount(item.value === "all" ? counts.total : counts[item.value])}</span>}
          </button>
        ))}
      </div>

      {data === null ? (
        <div className="post-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="user-row post-skeleton" />
          ))}
        </div>
      ) : data.accounts.length === 0 ? (
        <div className="empty-state">
          <h2>{query ? "No members match" : data.waiting ? "No members yet" : "Nobody on this plan"}</h2>
          <p>
            {query
              ? `Nothing matches “${query}”.${data.numberSearch ? "" : " To search by account number, add the server's ACCOUNT_PEPPER to this app's .env."}`
              : data.waiting
                ? "The videos server creates the accounts table on its first start."
                : "Members show up here once they register on the news or videos site."}
          </p>
        </div>
      ) : (
        <div className="post-list">
          <div className="user-row cat-head">
            <span>Name</span>
            <span>Plan</span>
            <span className="col-seen">Activity</span>
            <span />
          </div>
          {data.accounts.map((account) => (
            <button key={account.key} type="button" className="user-row" onClick={() => setEditing(account)}>
              <span className="visit-cell">
                <span className="visit-main">{account.name}</span>
                <span className="visit-sub">Joined {formatDate(account.createdAt)}</span>
              </span>
              <span className="visit-cell">
                <PlanBadge role={account.role} />
                <span className="visit-sub">{planNote(account)}</span>
              </span>
              <span className="visit-cell col-seen">
                <span className="visit-main">{seenText(account.lastSeenAt)}</span>
                <span className="visit-sub">
                  {account.devices} {account.devices === 1 ? "device" : "devices"} signed in
                  {account.paidCheckouts > 0 && ` · ${account.paidCheckouts} paid`}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="muted" />
            </button>
          ))}
        </div>
      )}

      {data?.next && (
        <div className="visit-more">
          <Button onClick={loadMore} loading={loadingMore}>
            Load more members
          </Button>
        </div>
      )}

      <Dialog.Root open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          {editing && <PlanDialog account={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
