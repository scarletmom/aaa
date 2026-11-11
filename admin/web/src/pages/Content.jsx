import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronDown, ChevronUp, CopyPlus, Ellipsis, ExternalLink, Eye, EyeOff, PencilLine, Plus, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { duplicatePath, formatCount, formatDate, loadSite, postPath, publicPostUrl } from "../lib/content.js";
import { Button, Select, Switch, Tip } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, Thumb, isSetupError, useThumbnailsPref } from "../ui/site.jsx";

const TABS = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "disabled", label: "Disabled" },
];
const ANY_CATEGORY = "any";
const NO_CATEGORY = "none";

function describeVisit(result) {
  if (result.kind === "embed") return "Iframe link, so it opened as is (workflows don't run on iframe pages)";
  if (!result.matched) return "No active workflow matches this URL, so it opened unchanged";
  if (result.fallback) return `“${result.workflow}” failed (${result.error}), so it opened the original URL`;
  const where = result.kind === "player" ? "stream inside the player link" : "Real URL";
  return `Resolved the ${where} with “${result.workflow}” in ${result.durationMs} ms${result.cached ? " (cached)" : ""}`;
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

export default function Content() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim().toLowerCase();
  const [posts, setPosts] = useState(null);
  const [site, setSite] = useState({});
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [tab, setTab] = useState("all");
  const [category, setCategory] = useState(ANY_CATEGORY);
  const [showThumbs, setShowThumbs] = useThumbnailsPref();
  const [visiting, setVisiting] = useState(null);

  const refresh = () =>
    api("/api/posts")
      .then(setPosts)
      .catch((err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error")));

  useEffect(() => {
    refresh();
    loadSite().then(setSite).catch(() => {});
  }, []);

  const categories = useMemo(() => {
    const seen = new Map();
    for (const post of posts || []) if (post.category) seen.set(post.category.id, post.category.name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [posts]);

  const visible = useMemo(
    () =>
      (posts || []).filter((post) => {
        if (tab === "live" && !post.enabled) return false;
        if (tab === "disabled" && post.enabled) return false;
        if (category === NO_CATEGORY && post.categoryId) return false;
        if (category !== ANY_CATEGORY && category !== NO_CATEGORY && String(post.categoryId) !== category) return false;
        return !query || post.title.toLowerCase().includes(query) || post.postTag.toLowerCase().includes(query);
      }),
    [posts, tab, category, query]
  );

  // The server swaps a post with its neighbour in the full list, so arrows only make sense unfiltered.
  const canReorder = tab === "all" && category === ANY_CATEGORY && !query;

  const replace = (tag, patch) => setPosts((list) => list.map((post) => (post.postTag === tag ? { ...post, ...patch } : post)));

  const setEnabled = async (post, enabled) => {
    replace(post.postTag, { enabled });
    try {
      await api(`/api/posts/${encodeURIComponent(post.postTag)}/enabled`, { method: "POST", body: { enabled } });
      toast(enabled ? `“${post.title}” is live again` : `“${post.title}” is disabled and now returns 404`);
    } catch (err) {
      toast(err.message, "error");
      refresh();
    }
  };

  const move = async (index, direction) => {
    const target = direction === "up" ? index - 1 : index + 1;
    const post = posts[index];
    setPosts((list) => {
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    try {
      const { moved } = await api(`/api/posts/${encodeURIComponent(post.postTag)}/move`, { method: "POST", body: { direction } });
      if (!moved) refresh();
    } catch (err) {
      toast(err.message, "error");
      refresh();
    }
  };

  const visit = async (post) => {
    // Opened during the click so popup blockers allow it; pointed at the result once it resolves.
    const tab = window.open("about:blank", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.title = "Resolving…";
      tab.document.body.textContent = `Resolving ?v=${post.postTag} through your workflows…`;
    }
    setVisiting(post.postTag);
    try {
      const result = await api(`/api/posts/${encodeURIComponent(post.postTag)}/visit`, { method: "POST" });
      if (tab) tab.location.href = result.finalUrl;
      else window.open(result.finalUrl, "_blank", "noopener");
      toast(describeVisit(result));
    } catch (err) {
      tab?.close();
      toast(err.message, "error");
    } finally {
      setVisiting(null);
    }
  };

  const remove = async (post) => {
    const ok = await confirm({
      title: `Delete “${post.title}”`,
      description: `The video page for ${post.postTag} stops working and its ${formatCount(post.views)} views are lost. To take it down for a while instead, disable it. This can't be undone.`,
      confirmLabel: "Delete post",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/posts/${encodeURIComponent(post.postTag)}`, { method: "DELETE" });
      setPosts((list) => list.filter((p) => p.postTag !== post.postTag));
      toast(`Deleted “${post.title}”`);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (setupNeeded) {
    return (
      <div className="home">
        <div className="home-head">
          <h1>Content</h1>
        </div>
        <SetupNotice />
      </div>
    );
  }

  const live = posts?.filter((post) => post.enabled).length ?? 0;
  const views = posts?.reduce((sum, post) => sum + post.views, 0) ?? 0;
  const counts = { all: posts?.length ?? 0, live, disabled: (posts?.length ?? 0) - live };

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Content</h1>
          <p className="home-sub">Posts on your website, in the order /r shows them</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => navigate("/content/new")}>
          New post
        </Button>
      </div>

      {posts && (
        <div className="stat-row">
          <Stat label="Posts" value={formatCount(posts.length)} note="total" />
          <Stat label="Live" value={formatCount(live)} note={`${formatCount(posts.length - live)} disabled`} />
          <Stat label="Views" value={formatCount(views)} note="all time" />
        </div>
      )}

      <div className="content-tabs" role="tablist" aria-label="Filter posts">
        {TABS.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} className="content-tab" onClick={() => setTab(item.value)}>
            {item.label}
            {posts && <span className="content-tab-count mono">{counts[item.value]}</span>}
          </button>
        ))}
      </div>

      <div className="content-toolbar">
        <Select
          value={category}
          onChange={setCategory}
          className="toolbar-select"
          aria-label="Category"
          options={[
            { value: ANY_CATEGORY, label: "All categories" },
            { value: NO_CATEGORY, label: "Uncategorised" },
            ...categories.map(([id, name]) => ({ value: String(id), label: name })),
          ]}
        />
        {!canReorder && posts?.length > 1 && <span className="toolbar-note">Clear filters and search to reorder</span>}
        <div className="spacer" />
        <Tip label="Off keeps the list light on mobile data">
          <span>
            <Switch checked={showThumbs} onChange={setShowThumbs} label="Thumbnails" />
          </span>
        </Tip>
      </div>

      {posts === null ? (
        <div className="post-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="post-row post-skeleton" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <h2>No posts yet</h2>
          <p>Each post gets its own /r link that runs visitors through the gate before the real URL</p>
          <Button variant="primary" icon={Plus} onClick={() => navigate("/content/new")}>
            New post
          </Button>
        </div>
      ) : (
        <div className="post-list" role="table" aria-label="Posts">
          <div className="post-row post-head" role="row">
            <span />
            <span>Post</span>
            <span className="col-visibility">Visibility</span>
            <span className="col-visit">Final URL</span>
            <span className="col-category">Category</span>
            <span className="col-date">Date</span>
            <span className="col-views">Views</span>
            <span />
          </div>
          {visible.map((post) => {
            const index = posts.indexOf(post);
            const url = publicPostUrl(site.siteUrl, post.postTag);
            const open = () => navigate(postPath(post.postTag));
            return (
              <div key={post.postTag} className={`post-row${post.enabled ? "" : " is-off"}`} role="row">
                <span className="post-move">
                  {canReorder && (
                    <>
                      <button type="button" className="move-btn" aria-label="Move up" disabled={index === 0} onClick={() => move(index, "up")}>
                        <ChevronUp size={16} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="move-btn" aria-label="Move down" disabled={index === posts.length - 1} onClick={() => move(index, "down")}>
                        <ChevronDown size={16} strokeWidth={1.75} />
                      </button>
                    </>
                  )}
                </span>
                <span className="post-main">
                  <button type="button" className="post-thumb-btn" onClick={open} aria-label={`Edit ${post.title}`}>
                    <Thumb src={post.thumbnail} duration={post.durationSeconds} show={showThumbs} />
                  </button>
                  <span className="post-text">
                    <button type="button" className="post-title" onClick={open}>
                      {post.title}
                    </button>
                    <span className="post-desc">{post.description}</span>
                    <span className="post-tag mono">?v={post.postTag}</span>
                    <span className="post-actions">
                      <Tip label="Details">
                        <button type="button" className="row-icon" aria-label="Edit details" onClick={open}>
                          <PencilLine size={16} strokeWidth={1.5} />
                        </button>
                      </Tip>
                      {url && (
                        <Tip label="View on site">
                          <a className="row-icon" href={url} target="_blank" rel="noopener noreferrer" aria-label="View on site">
                            <ExternalLink size={16} strokeWidth={1.5} />
                          </a>
                        </Tip>
                      )}
                      <Tip label={post.enabled ? "Disable" : "Enable"}>
                        <button type="button" className="row-icon" aria-label={post.enabled ? "Disable" : "Enable"} onClick={() => setEnabled(post, !post.enabled)}>
                          {post.enabled ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                        </button>
                      </Tip>
                    </span>
                  </span>
                </span>
                <span className="col-visibility">
                  <span className={`visibility${post.enabled ? " is-live" : ""}`}>
                    <span className="dot" />
                    {post.enabled ? "Live" : "Disabled"}
                  </span>
                </span>
                <span className="col-visit">
                  <Tip label="Run the Real URL through your workflows and open where a visitor ends up">
                    <Button size="sm" icon={SquareArrowOutUpRight} loading={visiting === post.postTag} onClick={() => visit(post)}>
                      Visit
                    </Button>
                  </Tip>
                </span>
                <span className="col-category post-category">{post.category?.name || <span className="muted">—</span>}</span>
                <span className="col-date muted">{formatDate(post.createdAt)}</span>
                <span className="col-views mono">{formatCount(post.views)}</span>
                <span>
                  <Menu
                    trigger={<Button variant="ghost" size="sm" icon={Ellipsis} aria-label="Post actions" />}
                    items={[
                      { label: "Edit details", icon: PencilLine, onSelect: open },
                      { label: "Duplicate", icon: CopyPlus, onSelect: () => navigate(duplicatePath(post.postTag)) },
                      { label: "Visit final URL", icon: SquareArrowOutUpRight, onSelect: () => visit(post) },
                      url && { label: "View on site", icon: ExternalLink, onSelect: () => window.open(url, "_blank", "noopener") },
                      { label: post.enabled ? "Disable" : "Enable", icon: post.enabled ? EyeOff : Eye, onSelect: () => setEnabled(post, !post.enabled) },
                      "separator",
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(post) },
                    ]}
                  />
                </span>
              </div>
            );
          })}
          {visible.length === 0 && <div className="wf-none">{query ? `Nothing matches “${params.get("q")}”` : "No posts match these filters"}</div>}
        </div>
      )}
    </div>
  );
}
