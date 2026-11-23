import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Bot, ChevronDown, Monitor, Smartphone, Tablet, UserRound, X } from "lucide-react";
import { api } from "../lib/api.js";
import { formatCount, formatDate } from "../lib/content.js";
import { Button } from "../ui/controls.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, isSetupError } from "../ui/site.jsx";
import { PlanBadge } from "../ui/members.jsx";

const TABS = [
  { value: "all", label: "All" },
  { value: "videos", label: "Videos site" },
  { value: "news", label: "News site" },
];
const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Monitor, bot: Bot };

const flag = (code) => (/^[A-Z]{2}$/.test(code || "") ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");

const timeFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return timeFormat.format(new Date(iso));
}

const place = (v) => [v.city, v.region].filter(Boolean).join(", ") || v.country || "Unknown location";

function connectionText(v) {
  const parts = [v.connectionType, v.downlinkMbps !== null && `${v.downlinkMbps} Mbps`, v.rttMs !== null && `${v.rttMs} ms RTT`].filter(Boolean);
  return parts.join(" · ");
}

function Stat({ label, value, note }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function Detail({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="visit-detail">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function MemberLink({ member, onPick }) {
  return (
    <button
      type="button"
      className="visit-member"
      title={`Show ${member.name}'s visits`}
      onClick={(e) => {
        e.stopPropagation();
        onPick(member.id);
      }}
    >
      <UserRound size={12} strokeWidth={2} />
      {member.name}
    </button>
  );
}

const deviceText = (d) => [d.browser || "Unknown browser", d.os].filter(Boolean).join(" on ");

function MemberSummary({ member, onClear }) {
  const signedOut = member.visits - member.signedIn;
  return (
    <section className="member-summary" aria-label={`Visits by ${member.name}`}>
      <div className="member-summary-head">
        <div>
          <h2>
            {member.name} <PlanBadge role={member.role} />
          </h2>
          <p className="home-sub">
            {member.visits
              ? `${formatCount(member.visits)} page views from ${formatDate(member.firstAt)} to ${formatDate(member.lastAt)} · ${member.ips} ${member.ips === 1 ? "IP" : "IPs"} · ${member.browsers} ${member.browsers === 1 ? "browser" : "browsers"}`
              : `No visits recorded since they joined on ${formatDate(member.joinedAt)}`}
          </p>
          {signedOut > 0 && <p className="member-summary-note">{formatCount(signedOut)} of them were from the same browsers while signed out.</p>}
        </div>
        <div className="member-summary-actions">
          <Link to={`/users?q=${encodeURIComponent(member.name)}`} className="btn btn-ghost btn-sm">
            Plan
          </Link>
          <Button variant="ghost" size="sm" icon={X} onClick={onClear}>
            All visits
          </Button>
        </div>
      </div>
      {member.places.length > 0 && (
        <div className="member-facts">
          <span className="member-facts-label">Places</span>
          {member.places.map((p) => (
            <span key={`${p.code}:${p.city}`} className="visit-country" title={`Last ${new Date(p.lastAt).toLocaleString()}`}>
              <span aria-hidden="true">{flag(p.code)}</span>
              {[p.city, p.region !== p.city && p.region, p.country].filter(Boolean).join(", ") || "Unknown location"}
              <span className="mono">{formatCount(p.count)}</span>
            </span>
          ))}
        </div>
      )}
      {member.devices.length > 0 && (
        <div className="member-facts">
          <span className="member-facts-label">Devices</span>
          {member.devices.map((d) => {
            const DeviceIcon = DEVICE_ICONS[d.device] || Monitor;
            return (
              <span key={`${d.device}:${d.os}:${d.browser}`} className="visit-country" title={`Last ${new Date(d.lastAt).toLocaleString()}`}>
                <DeviceIcon size={13} aria-hidden="true" />
                {deviceText(d)}
                <span className="mono">{formatCount(d.count)}</span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

function VisitDetails({ visit: v, onPickMember }) {
  const map = v.latitude !== null && `https://www.google.com/maps?q=${v.latitude},${v.longitude}`;
  return (
    <div className="visit-details">
      <Detail label="IP address">
        <span className="mono">{v.ip}</span>
      </Detail>
      <Detail label="Location">{[v.city, v.region, v.postal, v.country].filter(Boolean).join(", ")}</Detail>
      <Detail label="Coordinates">
        {map && (
          <a href={map} target="_blank" rel="noreferrer" className="mono">
            {v.latitude}, {v.longitude}
            {v.accuracyKm ? ` (±${v.accuracyKm} km)` : ""}
          </a>
        )}
      </Detail>
      <Detail label="ISP">{v.isp && `${v.isp}${v.asn ? ` (AS${v.asn})` : ""}`}</Detail>
      <Detail label="Connection">{connectionText(v)}</Detail>
      <Detail label="Timezone">{[v.timezone, v.clientTimezone && v.clientTimezone !== v.timezone && `device says ${v.clientTimezone}`].filter(Boolean).join(", ")}</Detail>
      <Detail label="Device">{[v.device, v.os, v.browser].filter(Boolean).join(" · ")}</Detail>
      <Detail label="Screen">{v.screen}</Detail>
      <Detail label="Language">{v.language}</Detail>
      <Detail label="Page">
        <span className="mono">{v.path}</span>
      </Detail>
      <Detail label="Came from">{v.referrer && <span className="mono">{v.referrer}</span>}</Detail>
      <Detail label="Member">{v.member && <MemberLink member={v.member} onPick={onPickMember} />}</Detail>
      <Detail label="Visitor ID">{v.visitorId && <span className="mono">{v.visitorId}</span>}</Detail>
      <Detail label="Time">{new Date(v.at).toLocaleString()}</Detail>
      <Detail label="User agent">{v.userAgent && <span className="mono visit-ua">{v.userAgent}</span>}</Detail>
    </div>
  );
}

export default function Visits() {
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") || "").trim();
  const user = params.get("user") || "";
  const [site, setSite] = useState("all");
  const [data, setData] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState(null);
  const request = useRef(0);

  const url = (before) => `/api/visits?${new URLSearchParams({ site, q: query, ...(user ? { user } : {}), ...(before ? { before } : {}) })}`;

  const pickMember = (id) => {
    setOpen(null);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("user", id);
      else next.delete("user");
      return next;
    });
  };

  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(
      () =>
        api(url())
          .then((result) => id === request.current && setData(result))
          .catch((err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error"))),
      query ? 300 : 0
    );
    return () => clearTimeout(timer);
  }, [site, query, user]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await api(url(data.next));
      setData((current) => ({ ...current, visits: [...current.visits, ...more.visits], next: more.next }));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoadingMore(false);
    }
  };

  if (setupNeeded) {
    return (
      <div className="home">
        <div className="home-head">
          <h1>Visits</h1>
        </div>
        <SetupNotice />
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Visits</h1>
          <p className="home-sub">Page views on the videos and news sites, with the visitor's IP location, ISP and device. Pick a member's name to see all their visits.</p>
        </div>
      </div>

      {data?.member && <MemberSummary member={data.member} onClear={() => pickMember("")} />}
      {data && user && !data.linked && (
        <div className="reel-banner" role="status">
          <span>Visits get linked to members once the videos server has restarted with this update. Showing all visits for now.</span>
        </div>
      )}

      {summary && (
        <>
          <div className="stat-row">
            <Stat label="Last 24 hours" value={formatCount(summary.today)} note="page views" />
            <Stat label="Last 7 days" value={formatCount(summary.week)} note="page views" />
            <Stat label="Visitors" value={formatCount(summary.visitorsWeek)} note="unique, last 7 days" />
          </div>
          {summary.countries.length > 0 && (
            <div className="visit-countries" aria-label="Top countries, last 7 days">
              {summary.countries.map((c) => (
                <span key={c.code} className="visit-country">
                  <span aria-hidden="true">{flag(c.code)}</span>
                  {c.name}
                  <span className="mono">{formatCount(c.count)}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="content-tabs" role="tablist" aria-label="Filter by site">
        {TABS.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={site === item.value} className="content-tab" onClick={() => setSite(item.value)}>
            {item.label}
          </button>
        ))}
      </div>

      {data === null ? (
        <div className="post-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="visit-row post-skeleton" />
          ))}
        </div>
      ) : data.visits.length === 0 ? (
        <div className="empty-state">
          <h2>{query || user ? "No visits match" : "No visits yet"}</h2>
          <p>
            {query
              ? `Nothing matches “${query}”`
              : data.waiting
                ? "The videos server creates the visits table on its next start. Visits show up here once people open the sites."
                : "Visits show up here once people open the videos or news site"}
          </p>
        </div>
      ) : (
        <div className="post-list">
          <div className="visit-row cat-head">
            <span>Location</span>
            <span>Network</span>
            <span className="col-device">Device</span>
            <span className="col-page">Page</span>
            <span>When</span>
          </div>
          {data.visits.map((v) => {
            const DeviceIcon = DEVICE_ICONS[v.device] || Monitor;
            const expanded = open === v.id;
            const toggle = () => setOpen(expanded ? null : v.id);
            return (
              <Fragment key={v.id}>
                <div
                  className="visit-row"
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={toggle}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
                >
                  <span className="visit-cell">
                    <span className="visit-main">
                      <span aria-hidden="true">{flag(v.countryCode)}</span> {place(v)}
                    </span>
                    <span className="visit-sub">
                      {v.member ? <MemberLink member={v.member} onPick={pickMember} /> : v.city || v.region ? v.country : ""}
                    </span>
                  </span>
                  <span className="visit-cell">
                    <span className="visit-main mono">{v.ip}</span>
                    <span className="visit-sub">{v.isp || "Unknown ISP"}</span>
                  </span>
                  <span className="visit-cell col-device">
                    <span className="visit-main">
                      <DeviceIcon size={14} aria-label={v.device} /> {v.browser || "Unknown browser"}
                    </span>
                    <span className="visit-sub">{[v.os, v.connectionType].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="visit-cell col-page">
                    <span className="visit-main mono">{v.path || "/"}</span>
                    <span className="visit-sub">{v.site === "news" ? "News site" : "Videos site"}</span>
                  </span>
                  <span className="visit-when">
                    <span>{timeAgo(v.at)}</span>
                    <ChevronDown size={14} className="visit-chevron" aria-hidden="true" />
                  </span>
                </div>
                {expanded && <VisitDetails visit={v} onPickMember={pickMember} />}
              </Fragment>
            );
          })}
        </div>
      )}

      {data?.next && (
        <div className="visit-more">
          <Button onClick={loadMore} loading={loadingMore}>
            Load older visits
          </Button>
        </div>
      )}
    </div>
  );
}
